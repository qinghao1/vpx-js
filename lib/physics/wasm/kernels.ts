import { fileURLToPath } from 'node:url'
import path from 'node:path'

type Mod = {
	_malloc: (n: number) => number
	_free: (p: number) => void
	HEAPF32: Float32Array
	HEAP32: Int32Array
	_batchHitTestCircle: (n: number, bx: number, by: number, bz: number, vx: number, vy: number, vz: number, br: number, cx: number, cy: number, cr: number, zl: number, zh: number, dt: number, oT: number, oContact: number, oNx: number, oNy: number, oNz: number, oDist: number, oBnv: number) => void
	_batchHitTestPlane: (n: number, bx: number, by: number, bz: number, vx: number, vy: number, vz: number, r: number, nx: number, ny: number, nz: number, d: number, dt: number, oT: number, oContact: number, oNx: number, oNy: number, oNz: number, oDist: number, oBnv: number) => void
	_batchHitTestLineZ: (n: number, bx: number, by: number, bz: number, vx: number, vy: number, vz: number, br: number, lx: number, ly: number, zl: number, zh: number, dt: number, oT: number, oContact: number, oNx: number, oNy: number, oNz: number, oDist: number, oBnv: number) => void
}

let mod: Mod | undefined
let loading: Promise<Mod> | undefined

export async function getWasmKernels(): Promise<Mod> {
	if (mod) return mod
	if (loading) return loading
	loading = (async () => {
		const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../wasm/kernels/dist')
		const { default: create } = await import(path.join(dir, 'kernels.js'))
		mod = (await create({ locateFile: (p: string) => path.join(dir, p) })) as Mod
		// Pre-warm outside hot loop so first hitTestBall never _mallocs.
		try { warmWasmPools(512, 512, 512) } catch {}
		return mod!
	})()
	return loading
}

export function isWasmReady(): boolean { return !!mod }
export function getWasmModSync(): Mod | undefined { return mod }

type PtrMap = Record<string, number>
type PoolState = { cap: number; ptrs: PtrMap | null }

function ensure(m: Mod, n: number, keys: readonly string[], s: PoolState): PtrMap {
	if (s.ptrs && n <= s.cap) return s.ptrs
	if (s.ptrs) for (const k of keys) m._free(s.ptrs[k]!)
	const p: PtrMap = {}
	for (const k of keys) p[k] = m._malloc(n * 4)
	s.ptrs = p
	s.cap = n
	return p
}

const circleKeys = ['cx', 'cy', 'cr', 'zl', 'zh'] as const
const planeKeys = ['nx', 'ny', 'nz', 'd'] as const
const lineKeys = ['lx', 'ly', 'zl', 'zh'] as const
const outKeys = ['oT', 'oContact', 'oNx', 'oNy', 'oNz', 'oDist', 'oBnv'] as const

type HitOut = {
	oT: Float32Array; oContact: Int32Array; oNx: Float32Array; oNy: Float32Array; oNz: Float32Array; oDist: Float32Array; oBnv: Float32Array
}

export type CircleViews = { cx: Float32Array; cy: Float32Array; cr: Float32Array; zl: Float32Array; zh: Float32Array } & HitOut & {
	run: (bx: number, by: number, bz: number, vx: number, vy: number, vz: number, br: number, dt: number) => void
}
export type PlaneViews = { nx: Float32Array; ny: Float32Array; nz: Float32Array; d: Float32Array } & HitOut & {
	run: (bx: number, by: number, bz: number, vx: number, vy: number, vz: number, r: number, dt: number) => void
}
export type LineViews = { lx: Float32Array; ly: Float32Array; zl: Float32Array; zh: Float32Array } & HitOut & {
	run: (bx: number, by: number, bz: number, vx: number, vy: number, vz: number, br: number, dt: number) => void
}

type Soa<V> = { in: PoolState; out: PoolState; views: V | null; buf: ArrayBufferLike | null; capSnap: number; outSnap: number; n: number }

const circleSoa: Soa<CircleViews> = { in: { cap: 0, ptrs: null }, out: { cap: 0, ptrs: null }, views: null, buf: null, capSnap: 0, outSnap: 0, n: 0 }
const planeSoa: Soa<PlaneViews> = { in: { cap: 0, ptrs: null }, out: { cap: 0, ptrs: null }, views: null, buf: null, capSnap: 0, outSnap: 0, n: 0 }
const lineSoa: Soa<LineViews> = { in: { cap: 0, ptrs: null }, out: { cap: 0, ptrs: null }, views: null, buf: null, capSnap: 0, outSnap: 0, n: 0 }

// Warm pools outside the hot loop so hitTestBall never _mallocs.
// Call once after wasm ready with max expected counts, or at table init.
export function warmWasmPools(c = 0, p = 0, l = 0): void {
	const m = getWasmModSync(); if (!m) return
	if (c) getWasmBatchHitViewsOutCircle(c)
	if (p) getWasmBatchHitViewsOutPlane(p)
	if (l) getWasmBatchHitViewsOutLineZ(l)
}

// Hot-path getters — no _malloc, just cached SoA views (zero-copy direct alias
// to wasm HEAPF32/HEAP32). Return null if not warmed / n > cap so caller can
// fall back to scalar and warm for the next tick.
export function tryGetWasmBatchHitViewsOutCircle(n: number): CircleViews | null {
	if (n === 0 || n > circleSoa.in.cap || !circleSoa.views) return null
	const m = getWasmModSync(); if (!m) return null
	if (circleSoa.buf !== m.HEAPF32.buffer) return null
	circleSoa.n = n
	return circleSoa.views
}
export function tryGetWasmBatchHitViewsOutPlane(n: number): PlaneViews | null {
	if (n === 0 || n > planeSoa.in.cap || !planeSoa.views) return null
	const m = getWasmModSync(); if (!m) return null
	if (planeSoa.buf !== m.HEAPF32.buffer) return null
	planeSoa.n = n
	return planeSoa.views
}
export function tryGetWasmBatchHitViewsOutLineZ(n: number): LineViews | null {
	if (n === 0 || n > lineSoa.in.cap || !lineSoa.views) return null
	const m = getWasmModSync(); if (!m) return null
	if (lineSoa.buf !== m.HEAPF32.buffer) return null
	lineSoa.n = n
	return lineSoa.views
}

export function getWasmBatchHitViewsOutCircle(n: number): CircleViews {
	const m = getWasmModSync()!
	const ip = ensure(m, n, circleKeys, circleSoa.in)
	const op = ensure(m, n, outKeys, circleSoa.out)
	circleSoa.n = n
	if (!circleSoa.views || circleSoa.buf !== m.HEAPF32.buffer || circleSoa.capSnap !== circleSoa.in.cap || circleSoa.outSnap !== circleSoa.out.cap) {
		circleSoa.views = {
			cx: new Float32Array(m.HEAPF32.buffer, ip.cx!, circleSoa.in.cap),
			cy: new Float32Array(m.HEAPF32.buffer, ip.cy!, circleSoa.in.cap),
			cr: new Float32Array(m.HEAPF32.buffer, ip.cr!, circleSoa.in.cap),
			zl: new Float32Array(m.HEAPF32.buffer, ip.zl!, circleSoa.in.cap),
			zh: new Float32Array(m.HEAPF32.buffer, ip.zh!, circleSoa.in.cap),
			oT: new Float32Array(m.HEAPF32.buffer, op.oT!, circleSoa.out.cap),
			oContact: new Int32Array(m.HEAP32.buffer, op.oContact!, circleSoa.out.cap),
			oNx: new Float32Array(m.HEAPF32.buffer, op.oNx!, circleSoa.out.cap),
			oNy: new Float32Array(m.HEAPF32.buffer, op.oNy!, circleSoa.out.cap),
			oNz: new Float32Array(m.HEAPF32.buffer, op.oNz!, circleSoa.out.cap),
			oDist: new Float32Array(m.HEAPF32.buffer, op.oDist!, circleSoa.out.cap),
			oBnv: new Float32Array(m.HEAPF32.buffer, op.oBnv!, circleSoa.out.cap),
			run: (bx, by, bz, vx, vy, vz, br, dt) => getWasmModSync()!._batchHitTestCircle(circleSoa.n, bx, by, bz, vx, vy, vz, br, circleSoa.in.ptrs!.cx!, circleSoa.in.ptrs!.cy!, circleSoa.in.ptrs!.cr!, circleSoa.in.ptrs!.zl!, circleSoa.in.ptrs!.zh!, dt, circleSoa.out.ptrs!.oT!, circleSoa.out.ptrs!.oContact!, circleSoa.out.ptrs!.oNx!, circleSoa.out.ptrs!.oNy!, circleSoa.out.ptrs!.oNz!, circleSoa.out.ptrs!.oDist!, circleSoa.out.ptrs!.oBnv!),
		}
		circleSoa.buf = m.HEAPF32.buffer
		circleSoa.capSnap = circleSoa.in.cap
		circleSoa.outSnap = circleSoa.out.cap
	}
	return circleSoa.views
}

export function getWasmBatchHitViewsOutPlane(n: number): PlaneViews {
	const m = getWasmModSync()!
	const ip = ensure(m, n, planeKeys, planeSoa.in)
	const op = ensure(m, n, outKeys, planeSoa.out)
	planeSoa.n = n
	if (!planeSoa.views || planeSoa.buf !== m.HEAPF32.buffer || planeSoa.capSnap !== planeSoa.in.cap || planeSoa.outSnap !== planeSoa.out.cap) {
		planeSoa.views = {
			nx: new Float32Array(m.HEAPF32.buffer, ip.nx!, planeSoa.in.cap),
			ny: new Float32Array(m.HEAPF32.buffer, ip.ny!, planeSoa.in.cap),
			nz: new Float32Array(m.HEAPF32.buffer, ip.nz!, planeSoa.in.cap),
			d: new Float32Array(m.HEAPF32.buffer, ip.d!, planeSoa.in.cap),
			oT: new Float32Array(m.HEAPF32.buffer, op.oT!, planeSoa.out.cap),
			oContact: new Int32Array(m.HEAP32.buffer, op.oContact!, planeSoa.out.cap),
			oNx: new Float32Array(m.HEAPF32.buffer, op.oNx!, planeSoa.out.cap),
			oNy: new Float32Array(m.HEAPF32.buffer, op.oNy!, planeSoa.out.cap),
			oNz: new Float32Array(m.HEAPF32.buffer, op.oNz!, planeSoa.out.cap),
			oDist: new Float32Array(m.HEAPF32.buffer, op.oDist!, planeSoa.out.cap),
			oBnv: new Float32Array(m.HEAPF32.buffer, op.oBnv!, planeSoa.out.cap),
			run: (bx, by, bz, vx, vy, vz, r, dt) => getWasmModSync()!._batchHitTestPlane(planeSoa.n, bx, by, bz, vx, vy, vz, r, planeSoa.in.ptrs!.nx!, planeSoa.in.ptrs!.ny!, planeSoa.in.ptrs!.nz!, planeSoa.in.ptrs!.d!, dt, planeSoa.out.ptrs!.oT!, planeSoa.out.ptrs!.oContact!, planeSoa.out.ptrs!.oNx!, planeSoa.out.ptrs!.oNy!, planeSoa.out.ptrs!.oNz!, planeSoa.out.ptrs!.oDist!, planeSoa.out.ptrs!.oBnv!),
		}
		planeSoa.buf = m.HEAPF32.buffer
		planeSoa.capSnap = planeSoa.in.cap
		planeSoa.outSnap = planeSoa.out.cap
	}
	return planeSoa.views
}

export function getWasmBatchHitViewsOutLineZ(n: number): LineViews {
	const m = getWasmModSync()!
	const ip = ensure(m, n, lineKeys, lineSoa.in)
	const op = ensure(m, n, outKeys, lineSoa.out)
	lineSoa.n = n
	if (!lineSoa.views || lineSoa.buf !== m.HEAPF32.buffer || lineSoa.capSnap !== lineSoa.in.cap || lineSoa.outSnap !== lineSoa.out.cap) {
		lineSoa.views = {
			lx: new Float32Array(m.HEAPF32.buffer, ip.lx!, lineSoa.in.cap),
			ly: new Float32Array(m.HEAPF32.buffer, ip.ly!, lineSoa.in.cap),
			zl: new Float32Array(m.HEAPF32.buffer, ip.zl!, lineSoa.in.cap),
			zh: new Float32Array(m.HEAPF32.buffer, ip.zh!, lineSoa.in.cap),
			oT: new Float32Array(m.HEAPF32.buffer, op.oT!, lineSoa.out.cap),
			oContact: new Int32Array(m.HEAP32.buffer, op.oContact!, lineSoa.out.cap),
			oNx: new Float32Array(m.HEAPF32.buffer, op.oNx!, lineSoa.out.cap),
			oNy: new Float32Array(m.HEAPF32.buffer, op.oNy!, lineSoa.out.cap),
			oNz: new Float32Array(m.HEAPF32.buffer, op.oNz!, lineSoa.out.cap),
			oDist: new Float32Array(m.HEAPF32.buffer, op.oDist!, lineSoa.out.cap),
			oBnv: new Float32Array(m.HEAPF32.buffer, op.oBnv!, lineSoa.out.cap),
			run: (bx, by, bz, vx, vy, vz, br, dt) => getWasmModSync()!._batchHitTestLineZ(lineSoa.n, bx, by, bz, vx, vy, vz, br, lineSoa.in.ptrs!.lx!, lineSoa.in.ptrs!.ly!, lineSoa.in.ptrs!.zl!, lineSoa.in.ptrs!.zh!, dt, lineSoa.out.ptrs!.oT!, lineSoa.out.ptrs!.oContact!, lineSoa.out.ptrs!.oNx!, lineSoa.out.ptrs!.oNy!, lineSoa.out.ptrs!.oNz!, lineSoa.out.ptrs!.oDist!, lineSoa.out.ptrs!.oBnv!),
		}
		lineSoa.buf = m.HEAPF32.buffer
		lineSoa.capSnap = lineSoa.in.cap
		lineSoa.outSnap = lineSoa.out.cap
	}
	return lineSoa.views
}
