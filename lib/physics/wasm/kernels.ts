type Mod = {
	_malloc: (n: number) => number
	_free: (p: number) => void
	HEAPF32: Float32Array
	HEAP32: Int32Array
	_batchHitTestCircle: (n: number, bx: number, by: number, bz: number, vx: number, vy: number, vz: number, br: number, cx: number, cy: number, cr: number, zl: number, zh: number, dt: number, oT: number, oContact: number, oNx: number, oNy: number, oNz: number, oDist: number, oBnv: number) => void
	_batchHitTestPlane: (n: number, bx: number, by: number, bz: number, vx: number, vy: number, vz: number, r: number, nx: number, ny: number, nz: number, d: number, dt: number, oT: number, oContact: number, oNx: number, oNy: number, oNz: number, oDist: number, oBnv: number) => void
	_batchHitTestLineZ: (n: number, bx: number, by: number, bz: number, vx: number, vy: number, vz: number, br: number, lx: number, ly: number, zl: number, zh: number, dt: number, oT: number, oContact: number, oNx: number, oNy: number, oNz: number, oDist: number, oBnv: number) => void
	_batchElasticityWithFalloff: (n: number, e: number, f: number, v: number, o: number) => void
}

let mod: Mod | undefined
let loading: Promise<Mod> | undefined

export async function getWasmKernels(): Promise<Mod> {
	if (mod) return mod
	if (loading) return loading
	loading = (async () => {
		const candidates: string[] = []
		if (import.meta.url.startsWith('http')) {
			candidates.push(
				new URL('/wasm/kernels/dist/kernels.js', import.meta.url).href,
				new URL('/wasm/kernels.js', import.meta.url).href,
			)
		}
		for (const rel of [
			'../../../wasm/kernels/dist/kernels.js',
			'../../../../wasm/kernels/dist/kernels.js',
			'../../wasm/kernels/dist/kernels.js',
		]) {
			try {
				const u = new URL(rel, import.meta.url).href
				if (!candidates.includes(u)) candidates.push(u)
			} catch {}
		}
		let lastErr: unknown
		for (const url of candidates) {
			try {
				const { default: create } = await import(/* @vite-ignore */ url)
				const base = new URL('.', url).href
				const locateFile = (p: string) => {
					const u = new URL(p, base)
					return u.protocol === 'file:' ? decodeURIComponent(u.pathname) : u.href
				}
				try {
					mod = (await (create as (o?: unknown) => Promise<Mod> )({ locateFile })) as Mod
				} catch {
					mod = (await (create as () => Promise<Mod> )()) as Mod
				}
				try { warmWasmPools(512, 512, 512) } catch {}
				return mod!
			} catch (e) { lastErr = e }
		}
		throw new Error(`WASM kernels not found${lastErr ? `: ${(lastErr as Error).message}` : ''}`)
	})()
	return loading
}

export function isWasmReady(): boolean { return !!mod }
export function getWasmModSync(): Mod | undefined { return mod }

type Pool = { cap: number; ptrs: Record<string, number> | null }
function ensure(m: Mod, n: number, keys: readonly string[], s: Pool): Record<string, number> {
	if (s.ptrs && n <= s.cap) return s.ptrs
	if (s.ptrs) for (const k of keys) m._free(s.ptrs[k]!)
	const p: Record<string, number> = {}
	for (const k of keys) p[k] = m._malloc(n * 4)
	s.ptrs = p
	s.cap = n
	return p
}

const circleKeys = ['cx', 'cy', 'cr', 'zl', 'zh'] as const
const planeKeys = ['nx', 'ny', 'nz', 'd'] as const
const lineKeys = ['lx', 'ly', 'zl', 'zh'] as const
const outKeys = ['oT', 'oContact', 'oNx', 'oNy', 'oNz', 'oDist', 'oBnv'] as const

type HitOut = { oT: Float32Array; oContact: Int32Array; oNx: Float32Array; oNy: Float32Array; oNz: Float32Array; oDist: Float32Array; oBnv: Float32Array }
export type CircleViews = { cx: Float32Array; cy: Float32Array; cr: Float32Array; zl: Float32Array; zh: Float32Array } & HitOut & { run: (bx: number, by: number, bz: number, vx: number, vy: number, vz: number, br: number, dt: number) => void }
export type PlaneViews = { nx: Float32Array; ny: Float32Array; nz: Float32Array; d: Float32Array } & HitOut & { run: (bx: number, by: number, bz: number, vx: number, vy: number, vz: number, r: number, dt: number) => void }
export type LineViews = { lx: Float32Array; ly: Float32Array; zl: Float32Array; zh: Float32Array } & HitOut & { run: (bx: number, by: number, bz: number, vx: number, vy: number, vz: number, br: number, dt: number) => void }

type Soa<V> = { in: Pool; out: Pool; views: V | null; buf: ArrayBufferLike | null; viewCap: number; n: number }

const circleSoa: Soa<CircleViews> = { in: { cap: 0, ptrs: null }, out: { cap: 0, ptrs: null }, views: null, buf: null, viewCap: 0, n: 0 }
const planeSoa: Soa<PlaneViews> = { in: { cap: 0, ptrs: null }, out: { cap: 0, ptrs: null }, views: null, buf: null, viewCap: 0, n: 0 }
const lineSoa: Soa<LineViews> = { in: { cap: 0, ptrs: null }, out: { cap: 0, ptrs: null }, views: null, buf: null, viewCap: 0, n: 0 }

export function warmWasmPools(c = 0, p = 0, l = 0): void {
	const m = getWasmModSync(); if (!m) return
	if (c) getWasmBatchHitViewsOutCircle(c)
	if (p) getWasmBatchHitViewsOutPlane(p)
	if (l) getWasmBatchHitViewsOutLineZ(l)
}

function tryGet<V extends HitOut & { run: Function } > (soa: Soa<V >, n: number): V | null {
	if (n === 0 || n > soa.in.cap || !soa.views) return null
	const m = getWasmModSync(); if (!m || soa.buf !== m.HEAPF32.buffer) return null
	soa.n = n
	return soa.views
}

export function tryGetWasmBatchHitViewsOutCircle(n: number): CircleViews | null { return tryGet(circleSoa, n) }
export function tryGetWasmBatchHitViewsOutPlane(n: number): PlaneViews | null { return tryGet(planeSoa, n) }
export function tryGetWasmBatchHitViewsOutLineZ(n: number): LineViews | null { return tryGet(lineSoa, n) }

function allocOut(m: Mod, ptrs: Record<string, number> , cap: number): HitOut {
	return {
		oT: new Float32Array(m.HEAPF32.buffer, ptrs.oT!, cap),
		oContact: new Int32Array(m.HEAP32.buffer, ptrs.oContact!, cap),
		oNx: new Float32Array(m.HEAPF32.buffer, ptrs.oNx!, cap),
		oNy: new Float32Array(m.HEAPF32.buffer, ptrs.oNy!, cap),
		oNz: new Float32Array(m.HEAPF32.buffer, ptrs.oNz!, cap),
		oDist: new Float32Array(m.HEAPF32.buffer, ptrs.oDist!, cap),
		oBnv: new Float32Array(m.HEAPF32.buffer, ptrs.oBnv!, cap),
	}
}

export function getWasmBatchHitViewsOutCircle(n: number): CircleViews {
	const m = getWasmModSync()!
	const ip = ensure(m, n, circleKeys, circleSoa.in)
	const op = ensure(m, n, outKeys, circleSoa.out)
	circleSoa.n = n
	if (!circleSoa.views || circleSoa.buf !== m.HEAPF32.buffer || circleSoa.viewCap !== circleSoa.in.cap) {
		const out = allocOut(m, op, circleSoa.out.cap)
		circleSoa.views = {
			cx: new Float32Array(m.HEAPF32.buffer, ip.cx!, circleSoa.in.cap),
			cy: new Float32Array(m.HEAPF32.buffer, ip.cy!, circleSoa.in.cap),
			cr: new Float32Array(m.HEAPF32.buffer, ip.cr!, circleSoa.in.cap),
			zl: new Float32Array(m.HEAPF32.buffer, ip.zl!, circleSoa.in.cap),
			zh: new Float32Array(m.HEAPF32.buffer, ip.zh!, circleSoa.in.cap),
			...out,
			run: (bx, by, bz, vx, vy, vz, br, dt) => getWasmModSync()!._batchHitTestCircle(circleSoa.n, bx, by, bz, vx, vy, vz, br, ip.cx!, ip.cy!, ip.cr!, ip.zl!, ip.zh!, dt, op.oT!, op.oContact!, op.oNx!, op.oNy!, op.oNz!, op.oDist!, op.oBnv!),
		}
		circleSoa.buf = m.HEAPF32.buffer
		circleSoa.viewCap = circleSoa.in.cap
	}
	return circleSoa.views
}

export function getWasmBatchHitViewsOutPlane(n: number): PlaneViews {
	const m = getWasmModSync()!
	const ip = ensure(m, n, planeKeys, planeSoa.in)
	const op = ensure(m, n, outKeys, planeSoa.out)
	planeSoa.n = n
	if (!planeSoa.views || planeSoa.buf !== m.HEAPF32.buffer || planeSoa.viewCap !== planeSoa.in.cap) {
		const out = allocOut(m, op, planeSoa.out.cap)
		planeSoa.views = {
			nx: new Float32Array(m.HEAPF32.buffer, ip.nx!, planeSoa.in.cap),
			ny: new Float32Array(m.HEAPF32.buffer, ip.ny!, planeSoa.in.cap),
			nz: new Float32Array(m.HEAPF32.buffer, ip.nz!, planeSoa.in.cap),
			d: new Float32Array(m.HEAPF32.buffer, ip.d!, planeSoa.in.cap),
			...out,
			run: (bx, by, bz, vx, vy, vz, r, dt) => getWasmModSync()!._batchHitTestPlane(planeSoa.n, bx, by, bz, vx, vy, vz, r, ip.nx!, ip.ny!, ip.nz!, ip.d!, dt, op.oT!, op.oContact!, op.oNx!, op.oNy!, op.oNz!, op.oDist!, op.oBnv!),
		}
		planeSoa.buf = m.HEAPF32.buffer
		planeSoa.viewCap = planeSoa.in.cap
	}
	return planeSoa.views
}

export function getWasmBatchHitViewsOutLineZ(n: number): LineViews {
	const m = getWasmModSync()!
	const ip = ensure(m, n, lineKeys, lineSoa.in)
	const op = ensure(m, n, outKeys, lineSoa.out)
	lineSoa.n = n
	if (!lineSoa.views || lineSoa.buf !== m.HEAPF32.buffer || lineSoa.viewCap !== lineSoa.in.cap) {
		const out = allocOut(m, op, lineSoa.out.cap)
		lineSoa.views = {
			lx: new Float32Array(m.HEAPF32.buffer, ip.lx!, lineSoa.in.cap),
			ly: new Float32Array(m.HEAPF32.buffer, ip.ly!, lineSoa.in.cap),
			zl: new Float32Array(m.HEAPF32.buffer, ip.zl!, lineSoa.in.cap),
			zh: new Float32Array(m.HEAPF32.buffer, ip.zh!, lineSoa.in.cap),
			...out,
			run: (bx, by, bz, vx, vy, vz, br, dt) => getWasmModSync()!._batchHitTestLineZ(lineSoa.n, bx, by, bz, vx, vy, vz, br, ip.lx!, ip.ly!, ip.zl!, ip.zh!, dt, op.oT!, op.oContact!, op.oNx!, op.oNy!, op.oNz!, op.oDist!, op.oBnv!),
		}
		lineSoa.buf = m.HEAPF32.buffer
		lineSoa.viewCap = lineSoa.in.cap
	}
	return lineSoa.views
}
