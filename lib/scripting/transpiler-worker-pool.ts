import type { Program } from 'estree'
import { idbGet, idbSet, vbsCacheKey } from '../util/idb-cache.js'
import { settleWorkerEntry, type WorkerPendingEntry, withWorkerTimeout } from '../util/worker-pending.js'
import { GlobalApi } from '../vpt/global-api.js'
import { ItemApi } from '../vpt/item-api.js'
import type { TableDataPayload } from './transpiler-worker-core.js'

let nodeWorker: any = null
const nodePending = new Map<number, WorkerPendingEntry<string>>()
let nodeNextId = 1
let nodeReady: Promise<any> | null = null

async function getNodeWorker(): Promise<any> {
	if (nodeWorker) return nodeWorker
	if (nodeReady) return nodeReady
	nodeReady = (async () => {
		const { Worker } = await import('node:worker_threads')
		const { existsSync } = await import('node:fs')
		const { fileURLToPath } = await import('node:url')
		const tryCreate = (url: URL, withTsx: boolean) => {
			try {
				if (withTsx) return new Worker(url as any, { execArgv: ['--import', 'tsx/esm'] } as any)
				return new Worker(url as any)
			} catch {
				return null
			}
		}
		let w: any = null
		for (const [p, tsx] of [
			['./transpiler.worker.node.js', false],
			['./transpiler.worker.node.js', true],
			['./transpiler.worker.node.ts', true],
		] as const) {
			const url = new URL(p, import.meta.url) as any
			if (!existsSync(fileURLToPath(url))) continue
			w = tryCreate(url, tsx)
			if (w) break
		}
		if (!w) throw new Error('transpiler worker not available - expected ./transpiler.worker.node.js')
		w.on('message', (m: any) => {
			const entry = settleWorkerEntry(nodePending, m.id)
			if (!entry) return
			m.ok ? entry.resolve(m.js) : entry.reject(new Error(m.error))
		})
		w.on('error', (e: any) => {
			for (const [, entry] of nodePending) {
				if (entry.timer) clearTimeout(entry.timer)
				entry.reject(e)
			}
			nodePending.clear()
		})
		w.on('exit', () => {
			nodeWorker = null
			nodeReady = null
			for (const [, entry] of nodePending) {
				if (entry.timer) clearTimeout(entry.timer)
				entry.reject(new Error('transpiler worker exited'))
			}
			nodePending.clear()
		})
		;(w as any).unref?.()
		nodeWorker = w
		return w
	})()
	return nodeReady
}

let browserWorker: Worker | null = null
const browserPending = new Map<number, WorkerPendingEntry<string>>()
let browserNextId = 1

const vbsMemCache = new Map<string, string>()
/**
 * Bound on cached transpiles: entries hold whole scripts, so cap the count
 * and evict oldest-first (Map preserves insertion order). Without this the
 * 32-bit hash keys above would let the map grow without limit.
 */
export const MAX_VBS_MEM_CACHE_ENTRIES = 50

/** Oldest-first insert into a size-bounded cache (Maps preserve insertion order). */
export function boundedSet<K, V>(map: Map<K, V>, key: K, value: V, max: number): void {
	if (!map.has(key) && map.size >= max) {
		const oldest = map.keys().next()
		if (!oldest.done) map.delete(oldest.value)
	}
	map.set(key, value)
}

export function setVbsMemCache(key: string, js: string): void {
	boundedSet(vbsMemCache, key, js, MAX_VBS_MEM_CACHE_ENTRIES)
}

export function getVbsMemCache(key: string): string | undefined {
	return vbsMemCache.get(key)
}

/**
 * Parsed ESTrees (`Grammar.transpile` output, pre-pipeline) by script content
 * hash. Parse + post-process are table-independent, so repeats skip straight
 * to the table-dependent pipeline. Shares the JS cache's oldest-first bound;
 * entries are cloned in and out because the pipeline mutates the tree.
 */
const astMemCache = new Map<string, Program>()
export const MAX_AST_MEM_CACHE_ENTRIES = MAX_VBS_MEM_CACHE_ENTRIES

export function getAstMemCache(key: string): Program | undefined {
	const hit = astMemCache.get(key)
	return hit === undefined ? undefined : (structuredClone(hit) as Program)
}

export function setAstMemCache(key: string, ast: Program): void {
	boundedSet(astMemCache, key, structuredClone(ast) as Program, MAX_AST_MEM_CACHE_ENTRIES)
	// Deliberately memory-only: a stored tree would only pay off when the JS
	// cache misses on a previously seen script — too rare for a clone + IDB
	// write per miss — and transpile must stay synchronous.
}

export function clearAstMemCache(): void {
	astMemCache.clear()
}

/** Memoized table hashes: payloads are treated as immutable after build. */
const tdHashMemo = new WeakMap<TableDataPayload, string>()

export function tdHash(td: TableDataPayload | null | undefined): string {
	if (!td) return 'notd'
	const memo = tdHashMemo.get(td)
	if (memo !== undefined) return memo
	try {
		let h = 5381
		const feed = (s: string): void => {
			for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i)
		}
		const feedEntries = (map: Record<string, string[]> | undefined): void => {
			for (const key of Object.keys(map ?? {}).sort()) {
				feed(key)
				feed(':')
				for (const value of (map as Record<string, string[]>)[key] ?? []) {
					feed(value)
					feed(',')
				}
				feed('|')
			}
		}
		const feedList = (list: string[] | undefined): void => {
			for (const value of [...(list ?? [])].sort()) {
				feed(value)
				feed(',')
			}
		}
		const names = [...(td.elementNames ?? [])].sort()
		for (const n of names) {
			feed(n)
			feed('|')
		}
		feed(';')
		feedEntries(td.elementApis)
		feed(';')
		feedEntries(td.elementApiFuncs)
		feed(';')
		feedEntries(td.elementApiUndefined)
		feed(';')
		feedList(td.globalFuncs)
		feed(';')
		feedList(td.globalUndefined)
		feed(';')
		feedEntries(td.elementEvents)
		const hash = (h >>> 0).toString(36)
		tdHashMemo.set(td, hash)
		return hash
	} catch {
		return 'badtd'
	}
}

export function cacheKey(vbs: string, gf?: string, go?: string, td?: TableDataPayload | null): string {
	return `${vbsCacheKey(vbs)}:${tdHash(td)}:${gf ?? ''}:${go ?? ''}`
}

function getBrowserWorker(): Worker {
	if (browserWorker) return browserWorker
	browserWorker = new Worker(new URL('./transpiler.worker.browser.js', import.meta.url), {
		type: 'module',
	} as any)
	browserWorker.onmessage = (e: MessageEvent) => {
		const m: any = (e as any).data
		const entry = settleWorkerEntry(browserPending, m.id)
		if (!entry) return
		m.ok ? entry.resolve(m.js) : entry.reject(new Error(m.error))
	}
	browserWorker.onerror = (e: any) => {
		for (const [, entry] of browserPending) {
			if (entry.timer) clearTimeout(entry.timer)
			entry.reject(new Error(e.message ?? String(e)))
		}
		browserPending.clear()
	}
	return browserWorker
}

export function warmTranspilerWorker(): void {
	try {
		if (typeof window !== 'undefined' && typeof document !== 'undefined') getBrowserWorker()
	} catch {}
}

function vbsLog(message: string): void {
	try {
		console.log(message)
	} catch {}
}

type Pending = Map<number, WorkerPendingEntry<string>>

function requestTranspile(
	message: { vbs: string; globalFunction?: string; globalObject?: string; tableData?: TableDataPayload | null },
	pending: Pending,
	id: number,
	post: (envelope: unknown) => void,
): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		pending.set(id, { resolve, reject })
		withWorkerTimeout(pending, id, 20000, 'transpiler worker timeout')
		try {
			post({ id, ...message })
		} catch (error) {
			settleWorkerEntry(pending, id)
			reject(error)
			return
		}
	})
}

export async function transpileWithWorker(
	vbs: string,
	gf?: string,
	go?: string,
	td?: TableDataPayload | null,
): Promise<string> {
	const key = cacheKey(vbs, gf, go, td)
	const mem = getVbsMemCache(key)
	if (mem) {
		vbsLog(`[vbs] mem hit ${key.slice(0, 32)}… ${mem.length} chars`)
		return mem
	}

	if (typeof indexedDB !== 'undefined') {
		const t0 = Date.now()
		const hit = await idbGet(key)
		const dt = Date.now() - t0
		if (typeof hit === 'string' && hit.length) {
			vbsLog(`[vbs] idb hit ${key.slice(0, 32)}… ${hit.length} chars in ${dt}ms`)
			setVbsMemCache(key, hit)
			return hit
		}
		vbsLog(`[vbs] idb miss ${key.slice(0, 32)}… (${dt}ms)`)
	}
	const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'
	const message = { vbs, globalFunction: gf, globalObject: go, tableData: td }
	let js: string
	if (isBrowser) {
		const t1 = Date.now()
		js = await requestTranspile(message, browserPending, browserNextId++, m => getBrowserWorker().postMessage(m))
		vbsLog(`[vbs] worker transpile ${js.length} chars in ${Date.now() - t1}ms`)
	} else {
		const w = await getNodeWorker()
		js = await requestTranspile(message, nodePending, nodeNextId++, m => w.postMessage(m))
	}
	setVbsMemCache(key, js)
	if (typeof indexedDB !== 'undefined') void idbSet(key, js).catch(() => {})
	return js
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

/**
 * Payload memo: the walk below costs tens of ms on big tables, but table
 * content is fixed after load. Element names are re-read every call and must
 * match exactly, so changed elements rebuild instead of serving stale data.
 */
const tableDataMemo = new WeakMap<object, { names: string[]; player: unknown; payload: TableDataPayload | null }>()

export function getTableDataForWorker(table: any, player?: any): TableDataPayload | null {
	try {
		const elements = table.getElements?.() ?? {}
		const names = Object.keys(elements)
		const memo = tableDataMemo.get(table)
		if (
			memo &&
			memo.player === player &&
			memo.names.length === names.length &&
			memo.names.every((name, index) => name === names[index])
		) {
			return memo.payload
		}
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
			const props = [
				...new Set([...(api._getPropertyNames?.() ?? []), ...Object.getOwnPropertyNames(ItemApi.prototype)]),
			]
			if (props.length) elementApis[n] = props
			const proto = Object.getPrototypeOf(api)
			const funcs: string[] = []
			const undef: string[] = []
			for (const p of props) {
				if (isMethod(proto, p)) funcs.push(p)
				else {
					try {
						// Prototype walk misses instance fields (e.g. arrow-function props), so
						// fall back to the runtime value: functions are funcs, matching the main thread.
						const value = (api as any)[p]
						if (typeof value === 'undefined') undef.push(p)
						else if (typeof value === 'function') funcs.push(p)
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
		const payload: TableDataPayload = {
			elementNames: names,
			elementEvents: events,
			elementApis,
			elementApiFuncs: elementFuncs,
			elementApiUndefined: elementUndef,
			globalFuncs,
			globalUndefined: globalUndef,
		}
		tableDataMemo.set(table, { names, player, payload })
		return payload
	} catch {
		return null
	}
}
