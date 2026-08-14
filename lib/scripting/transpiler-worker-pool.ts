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
			w.on('message', (m: any) => {
				const p = nodePending.get(m.id)
				if (!p) return
				nodePending.delete(m.id)
				m.ok ? p.resolve(m.js) : p.reject(new Error(m.error))
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
			const m: any = (e as any).data
			const p = browserPending.get(m.id)
			if (!p) return
			browserPending.delete(m.id)
			m.ok ? p.resolve(m.js) : p.reject(new Error(m.error))
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
	gf?: string,
	go?: string,
	td?: TableDataPayload | null,
): Promise<string> {
	const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined' && typeof Worker !== 'undefined'
	if (isBrowser) {
		const w = getBrowserWorker()
		if (!w) return coreTranspile({ vbs, globalFunction: gf, globalObject: go, tableData: td })
		return new Promise<string>((resolve, reject) => {
			const id = browserNextId++
			browserPending.set(id, { resolve, reject })
			w.postMessage({ id, vbs, globalFunction: gf, globalObject: go, tableData: td })
			setTimeout(() => {
				if (browserPending.has(id)) {
					browserPending.delete(id)
					reject(new Error('worker timeout'))
				}
			}, 20000)
		})
	}
	try {
		const w = await getNodeWorkerAsync()
		if (!w) return coreTranspile({ vbs, globalFunction: gf, globalObject: go, tableData: td })
		return await new Promise<string>((resolve, reject) => {
			const id = nodeNextId++
			nodePending.set(id, { resolve, reject })
			try {
				w.postMessage({ id, vbs, globalFunction: gf, globalObject: go, tableData: td })
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
		return coreTranspile({ vbs, globalFunction: gf, globalObject: go, tableData: td })
	}
}

function isMethod(proto: any, prop: string): boolean {
	let cur = proto
	while (cur && cur !== Object.prototype) {
		const d = Object.getOwnPropertyDescriptor(cur, prop)
		if (d) return typeof d.value === 'function'
		cur = Object.getPrototypeOf(cur)
	}
	return false
}

export function getTableDataForWorker(table: any, player?: any): TableDataPayload | null {
	try {
		const elements = table.getElements?.() ?? {}
		const names = Object.keys(elements)
		const events: Record<string, string[]> = {}
		for (const n of names) {
			try {
				events[n] = elements[n]?.getEventNames?.() ?? []
			} catch {
				events[n] = []
			}
		}
		const apis = table.getElementApis?.() ?? {}
		const elementApis: Record<string, string[]> = {}
		const elementFuncs: Record<string, string[]> = {}
		const elementUndef: Record<string, string[]> = {}
		for (const n of names) {
			const api = apis[n]
			if (!api) continue
			let props: string[] = api._getPropertyNames?.() ?? []
			props = [...new Set([...props, ...Object.getOwnPropertyNames(ItemApi.prototype)])]
			if (props.length) elementApis[n] = props
			const proto = Object.getPrototypeOf(api)
			const funcs: string[] = []
			const undef: string[] = []
			for (const p of props) {
				if (isMethod(proto, p)) funcs.push(p)
				else {
					try {
						if (typeof (api as any)[p] === 'undefined') undef.push(p)
					} catch {
						undef.push(p)
					}
				}
			}
			if (funcs.length) elementFuncs[n] = funcs
			if (undef.length) elementUndef[n] = undef
		}
		const globalFuncs: string[] = []
		const globalUndef: string[] = []
		let sample: any = null
		if (player)
			try {
				sample = new GlobalApi(table, player)
			} catch {}
		for (const p of Object.getOwnPropertyNames(GlobalApi.prototype)) {
			if (isMethod(GlobalApi.prototype, p)) globalFuncs.push(p)
			else if (sample) {
				try {
					if (typeof sample[p] === 'undefined') globalUndef.push(p)
				} catch {
					globalUndef.push(p)
				}
			}
		}
		return {
			elementNames: names,
			elementEvents: events,
			elementApis,
			elementApiFuncs: elementFuncs,
			elementApiUndefined: elementUndef,
			globalFuncs,
			globalUndefined: globalUndef,
		}
	} catch {
		return null
	}
}
