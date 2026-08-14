import * as EnumsMod from '../vpt/enums.js'
import { GlobalApi } from '../vpt/global-api.js'
import { ItemApi } from '../vpt/item-api.js'
import { Stdlib } from './stdlib/index.js'
import { transpileInWorker as coreTranspile, type TableDataPayload } from './transpiler-worker-core.js'

let nodeWorker: any = null
const nodePending = new Map<number, { resolve: (s: string) => void; reject: (e: any) => void }>()
let nodeNextId = 1
let nodeWorkerPromise: Promise<any> | null = null
async function getNodeWorkerAsync(): Promise<any> {
	if (nodeWorker) return nodeWorker
	if (nodeWorkerPromise) return nodeWorkerPromise
	nodeWorkerPromise = (async () => {
		try {
			const { Worker } = await import('node:worker_threads')
			const w: any = new Worker(new URL('./transpiler.worker.node.ts', import.meta.url) as any, {} as any)
			w.on('message', (msg: any) => {
				const p = nodePending.get(msg.id)
				if (!p) return
				nodePending.delete(msg.id)
				if (msg.ok) p.resolve(msg.js)
				else p.reject(new Error(msg.error))
			})
			w.on('error', (e: any) => {
				for (const [, p] of nodePending) p.reject(e)
				nodePending.clear()
			})
			w.on('exit', () => {
				nodeWorker = null
				nodeWorkerPromise = null
			})
			nodeWorker = w
			return w
		} catch {
			nodeWorkerPromise = null
			return null
		}
	})()
	return nodeWorkerPromise
}

let browserWorker: Worker | null = null
const browserPending = new Map<number, { resolve: (s: string) => void; reject: (e: any) => void }>()
let browserNextId = 1

function getBrowserWorker(): Worker | null {
	if (browserWorker) return browserWorker
	if (typeof Worker === 'undefined') return null
	try {
		browserWorker = new Worker(new URL('./transpiler.worker.browser.ts', import.meta.url), {
			type: 'module',
		} as any)
		browserWorker.onmessage = (e: MessageEvent) => {
			const msg: any = (e as any).data
			const p = browserPending.get(msg.id)
			if (!p) return
			browserPending.delete(msg.id)
			if (msg.ok) p.resolve(msg.js)
			else p.reject(new Error(msg.error))
		}
		browserWorker.onerror = (e: any) => {
			for (const [, p] of browserPending) p.reject(new Error(e.message ?? String(e)))
			browserPending.clear()
		}
	} catch {
		browserWorker = null
	}
	return browserWorker
}

export async function transpileWithWorker(
	vbs: string,
	globalFunction?: string,
	globalObject?: string,
	tableData?: TableDataPayload | null,
): Promise<string> {
	const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined' && typeof Worker !== 'undefined'
	if (isBrowser) {
		const w = getBrowserWorker()
		if (!w) return coreTranspile({ vbs, globalFunction, globalObject, tableData })
		return new Promise<string>((resolve, reject) => {
			const id = browserNextId++
			browserPending.set(id, { resolve, reject })
			w.postMessage({ id, vbs, globalFunction, globalObject, tableData })
			setTimeout(() => {
				if (browserPending.has(id)) {
					browserPending.delete(id)
					reject(new Error('worker timeout'))
				}
			}, 20000)
		})
	} else {
		try {
			const w = await getNodeWorkerAsync()
			if (!w) return coreTranspile({ vbs, globalFunction, globalObject, tableData })
			return await new Promise<string>((resolve, reject) => {
				const id = nodeNextId++
				nodePending.set(id, { resolve, reject })
				try {
					w.postMessage({ id, vbs, globalFunction, globalObject, tableData })
				} catch (e) {
					nodePending.delete(id)
					reject(e)
					return
				}
				setTimeout(() => {
					if (nodePending.has(id)) {
						nodePending.delete(id)
						reject(new Error('worker timeout'))
					}
				}, 20000)
			})
		} catch {
			return coreTranspile({ vbs, globalFunction, globalObject, tableData })
		}
	}
}

function isPrototypeMethod(proto: any, prop: string): boolean {
	let cur = proto
	while (cur && cur !== Object.prototype) {
		const desc = Object.getOwnPropertyDescriptor(cur, prop)
		if (desc) {
			if (typeof desc.value === 'function') return true
			if (desc.get) return false
			return false
		}
		cur = Object.getPrototypeOf(cur)
	}
	return false
}

export function getTableDataForWorker(table: any, player?: any): TableDataPayload | null {
	try {
		const elements = table.getElements ? table.getElements() : {}
		const elementNames = Object.keys(elements)
		const elementEvents: Record<string, string[]> = {}
		for (const name of elementNames) {
			try {
				elementEvents[name] = elements[name]?.getEventNames?.() ?? []
			} catch {
				elementEvents[name] = []
			}
		}
		const apis = table.getElementApis ? table.getElementApis() : {}
		const elementApis: Record<string, string[]> = {}
		const elementApiFuncs: Record<string, string[]> = {}
		const elementApiUndefined: Record<string, string[]> = {}
		for (const name of elementNames) {
			const api = apis[name]
			if (!api) continue
			try {
				let names: string[] = (api as any)._getPropertyNames?.() ?? []
				const baseNames = Object.getOwnPropertyNames(ItemApi.prototype)
				const merged = new Set<string>([...names, ...baseNames])
				names = [...merged]
				if (names.length) elementApis[name] = names
				const proto = Object.getPrototypeOf(api)
				const funcs: string[] = []
				const undef: string[] = []
				for (const p of names) {
					try {
						if (isPrototypeMethod(proto, p)) funcs.push(p)
						else {
							let v: unknown
							try {
								v = (api as any)[p]
							} catch {
								v = undefined
							}
							if (typeof v === 'undefined') undef.push(p)
						}
					} catch {}
				}
				if (funcs.length) elementApiFuncs[name] = funcs
				if (undef.length) elementApiUndefined[name] = undef
			} catch {}
		}
		const globalProps = Object.getOwnPropertyNames(GlobalApi.prototype)
		const globalFuncs: string[] = []
		const globalUndefined: string[] = []
		let globalSample: any = null
		if (player) {
			try {
				globalSample = new GlobalApi(table, player)
			} catch {}
		}
		for (const p of globalProps) {
			try {
				if (isPrototypeMethod(GlobalApi.prototype, p)) {
					globalFuncs.push(p)
				} else if (globalSample) {
					let v: unknown
					try {
						v = (globalSample as any)[p]
					} catch {
						v = undefined
					}
					if (typeof v === 'undefined') globalUndefined.push(p)
				}
			} catch {}
		}
		const stdlibInst = new Stdlib()
		const stdlibProps = Object.getOwnPropertyNames(Object.getPrototypeOf(stdlibInst)).concat(
			Object.getOwnPropertyNames(stdlibInst),
		)
		const enumProps: Record<string, string[]> = {}
		for (const k of Object.keys(EnumsMod as any)) {
			const v = (EnumsMod as any)[k]
			if (v && typeof v === 'function' && v.prototype) {
				try {
					enumProps[k] = Object.getOwnPropertyNames(v.prototype)
				} catch {}
			} else if (v && typeof v === 'object') {
				try {
					enumProps[k] = Object.getOwnPropertyNames(v)
				} catch {}
			}
		}
		return {
			elementNames,
			elementEvents,
			elementApis,
			elementApiFuncs,
			elementApiUndefined,
			globalProps,
			globalFuncs,
			globalUndefined,
			stdlibProps,
			enumProps,
		}
	} catch {
		return null
	}
}
