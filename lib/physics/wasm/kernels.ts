import { fileURLToPath } from 'node:url'
import path from 'node:path'

type Mod = {
	_malloc: (n: number) => number
	_free: (p: number) => void
	HEAPF32: Float32Array
	HEAP32: Int32Array
	_elasticityWithFalloff: (e: number, f: number, v: number) => number
	_solveQuadratic: (a: number, b: number, c: number, p1: number, p2: number) => number
	_hitTestPlane: (bx: number, by: number, bz: number, vx: number, vy: number, vz: number, r: number, nx: number, ny: number, nz: number, d: number, dt: number, en: number, ox: number, oy: number, oz: number, od: number, oc: number, ob: number) => number
	_hitTestCircle: (bx: number, by: number, bz: number, vx: number, vy: number, vz: number, br: number, cx: number, cy: number, cr: number, zl: number, zh: number, dt: number, en: number, fr: number, ox: number, oy: number, oz: number, od: number, oc: number, ob: number) => number
	_hitTestLineZ: (bx: number, by: number, bz: number, vx: number, vy: number, vz: number, br: number, lx: number, ly: number, zl: number, zh: number, dt: number, en: number, ox: number, oy: number, oz: number, od: number, oc: number, ob: number) => number
	_collide3DWall: (vx: number, vy: number, vz: number, nx: number, ny: number, nz: number, e: number, f: number, s: number, ox: number, oy: number, oz: number) => number
	_batchElasticityWithFalloff: (n: number, e: number, f: number, v: number, o: number) => void
	_batchHitTestCircle: (n: number, bx: number, by: number, bz: number, vx: number, vy: number, vz: number, br: number, cx: number, cy: number, cr: number, zl: number, zh: number, dt: number, oT: number, oContact: number, oNx: number, oNy: number, oNz: number, oDist: number, oBnv: number) => void
	_batchHitTestPlane: (n: number, bx: number, by: number, bz: number, vx: number, vy: number, vz: number, r: number, nx: number, ny: number, nz: number, d: number, dt: number, oT: number, oContact: number, oNx: number, oNy: number, oNz: number, oDist: number, oBnv: number) => void
	_batchHitTestLineZ: (n: number, bx: number, by: number, bz: number, vx: number, vy: number, vz: number, br: number, lx: number, ly: number, zl: number, zh: number, dt: number, oT: number, oContact: number, oNx: number, oNy: number, oNz: number, oDist: number, oBnv: number) => void
	_benchElasticityWithFalloff: (n: number, seed: number) => number
	_benchHitTestCircle: (n: number, seed: number) => number
	_benchHitTestPlane: (n: number, seed: number) => number
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
		return mod!
	})()
	return loading
}

export function isWasmReady(): boolean { return !!mod }
export function getWasmModSync(): Mod | undefined { return mod }

let scratch = 0
function scratchPtr(m: Mod): number {
	if (!scratch) scratch = m._malloc(24)
	return scratch
}
export function getWasmScratchPtr(m: Mod): number { return scratchPtr(m) }

let batchCap = 0
let batchPtr: { pe: number; pf: number; pv: number; po: number } | null = null
function batchPtrs(m: Mod, n: number) {
	if (batchPtr && n <= batchCap) return batchPtr
	if (batchPtr) { m._free(batchPtr.pe); m._free(batchPtr.pf); m._free(batchPtr.pv); m._free(batchPtr.po) }
	batchPtr = { pe: m._malloc(n * 4), pf: m._malloc(n * 4), pv: m._malloc(n * 4), po: m._malloc(n * 4) }
	batchCap = n
	return batchPtr
}

let cCap = 0, cPtr: { cx: number; cy: number; cr: number; zl: number; zh: number } | null = null
function cPtrs(m: Mod, n: number) {
	if (cPtr && n <= cCap) return cPtr
	if (cPtr) { m._free(cPtr.cx); m._free(cPtr.cy); m._free(cPtr.cr); m._free(cPtr.zl); m._free(cPtr.zh) }
	cPtr = { cx: m._malloc(n * 4), cy: m._malloc(n * 4), cr: m._malloc(n * 4), zl: m._malloc(n * 4), zh: m._malloc(n * 4) }
	cCap = n; return cPtr
}
let pCap = 0, pPtr: { nx: number; ny: number; nz: number; d: number } | null = null
function pPtrs(m: Mod, n: number) {
	if (pPtr && n <= pCap) return pPtr
	if (pPtr) { m._free(pPtr.nx); m._free(pPtr.ny); m._free(pPtr.nz); m._free(pPtr.d) }
	pPtr = { nx: m._malloc(n * 4), ny: m._malloc(n * 4), nz: m._malloc(n * 4), d: m._malloc(n * 4) }
	pCap = n; return pPtr
}
let lCap = 0, lPtr: { lx: number; ly: number; zl: number; zh: number } | null = null
function lPtrs(m: Mod, n: number) {
	if (lPtr && n <= lCap) return lPtr
	if (lPtr) { m._free(lPtr.lx); m._free(lPtr.ly); m._free(lPtr.zl); m._free(lPtr.zh) }
	lPtr = { lx: m._malloc(n * 4), ly: m._malloc(n * 4), zl: m._malloc(n * 4), zh: m._malloc(n * 4) }
	lCap = n; return lPtr
}

let cOutCap = 0, cOut: { oT: number; oContact: number; oNx: number; oNy: number; oNz: number; oDist: number; oBnv: number } | null = null
function cOutPtrs(m: Mod, n: number) {
	if (cOut && n <= cOutCap) return cOut
	if (cOut) { m._free(cOut.oT); m._free(cOut.oContact); m._free(cOut.oNx); m._free(cOut.oNy); m._free(cOut.oNz); m._free(cOut.oDist); m._free(cOut.oBnv) }
	cOut = { oT: m._malloc(n * 4), oContact: m._malloc(n * 4), oNx: m._malloc(n * 4), oNy: m._malloc(n * 4), oNz: m._malloc(n * 4), oDist: m._malloc(n * 4), oBnv: m._malloc(n * 4) }
	cOutCap = n; return cOut
}
let pOutCap = 0, pOut: { oT: number; oContact: number; oNx: number; oNy: number; oNz: number; oDist: number; oBnv: number } | null = null
function pOutPtrs(m: Mod, n: number) {
	if (pOut && n <= pOutCap) return pOut
	if (pOut) { m._free(pOut.oT); m._free(pOut.oContact); m._free(pOut.oNx); m._free(pOut.oNy); m._free(pOut.oNz); m._free(pOut.oDist); m._free(pOut.oBnv) }
	pOut = { oT: m._malloc(n * 4), oContact: m._malloc(n * 4), oNx: m._malloc(n * 4), oNy: m._malloc(n * 4), oNz: m._malloc(n * 4), oDist: m._malloc(n * 4), oBnv: m._malloc(n * 4) }
	pOutCap = n; return pOut
}
let lOutCap = 0, lOut: { oT: number; oContact: number; oNx: number; oNy: number; oNz: number; oDist: number; oBnv: number } | null = null
function lOutPtrs(m: Mod, n: number) {
	if (lOut && n <= lOutCap) return lOut
	if (lOut) { m._free(lOut.oT); m._free(lOut.oContact); m._free(lOut.oNx); m._free(lOut.oNy); m._free(lOut.oNz); m._free(lOut.oDist); m._free(lOut.oBnv) }
	lOut = { oT: m._malloc(n * 4), oContact: m._malloc(n * 4), oNx: m._malloc(n * 4), oNy: m._malloc(n * 4), oNz: m._malloc(n * 4), oDist: m._malloc(n * 4), oBnv: m._malloc(n * 4) }
	lOutCap = n; return lOut
}

export type WasmHit = {
	hitTime: number
	normal: [number, number, number]
	hitDistance: number
	isContact: boolean
	hitOrgNormalVelocity: number
}

function hitTestDirect(
	fn: 'plane' | 'circle' | 'linez',
	bx: number, by: number, bz: number, vx: number, vy: number, vz: number, br: number,
	a0: number, a1: number, a2: number, a3: number, a4: number, dt: number, en: number, fr: number,
	m: Mod,
): WasmHit | undefined {
	const p = scratchPtr(m)
	const px = p, py = p + 4, pz = p + 8, pd = p + 12, pc = p + 16, pv = p + 20
	const t = fn === 'plane'
		? m._hitTestPlane(bx, by, bz, vx, vy, vz, br, a0, a1, a2, a3, dt, en, px, py, pz, pd, pc, pv)
		: fn === 'circle'
			? m._hitTestCircle(bx, by, bz, vx, vy, vz, br, a0, a1, a2, a3, a4, dt, en, fr, px, py, pz, pd, pc, pv)
			: m._hitTestLineZ(bx, by, bz, vx, vy, vz, br, a0, a1, a2, a3, dt, en, px, py, pz, pd, pc, pv)
	if (t < -0.5) return undefined
	return {
		hitTime: t,
		normal: [m.HEAPF32[px >> 2]!, m.HEAPF32[py >> 2]!, m.HEAPF32[pz >> 2]!],
		hitDistance: m.HEAPF32[pd >> 2]!,
		isContact: !!m.HEAP32[pc >> 2],
		hitOrgNormalVelocity: m.HEAPF32[pv >> 2]!,
	}
}

export async function wasmElasticityWithFalloff(e: number, f: number, v: number): Promise<number> {
	const m = await getWasmKernels()
	return m._elasticityWithFalloff(e, f, v)
}
export async function wasmSolveQuadratic(a: number, b: number, c: number): Promise<[number, number] | undefined> {
	const m = await getWasmKernels()
	const p = scratchPtr(m)
	const ok = m._solveQuadratic(a, b, c, p, p + 4)
	return ok ? [m.HEAPF32[p >> 2]!, m.HEAPF32[(p >> 2) + 1]!] : undefined
}
export async function wasmHitTestPlane(
	bx: number, by: number, bz: number, vx: number, vy: number, vz: number, r: number,
	nx: number, ny: number, nz: number, d: number, dt: number, en: boolean,
): Promise<WasmHit | undefined> {
	const m = await getWasmKernels()
	return hitTestDirect('plane', bx, by, bz, vx, vy, vz, r, nx, ny, nz, d, 0, dt, en ? 1 : 0, 0, m)
}
export async function wasmHitTestCircle(
	bx: number, by: number, bz: number, vx: number, vy: number, vz: number, br: number,
	cx: number, cy: number, cr: number, zl: number, zh: number, dt: number, en: boolean, frozen = false,
): Promise<WasmHit | undefined> {
	const m = await getWasmKernels()
	return hitTestDirect('circle', bx, by, bz, vx, vy, vz, br, cx, cy, cr, zl, zh, dt, en ? 1 : 0, frozen ? 1 : 0, m)
}
export async function wasmHitTestLineZ(
	bx: number, by: number, bz: number, vx: number, vy: number, vz: number, br: number,
	lx: number, ly: number, zl: number, zh: number, dt: number, en: boolean,
): Promise<WasmHit | undefined> {
	const m = await getWasmKernels()
	return hitTestDirect('linez', bx, by, bz, vx, vy, vz, br, lx, ly, zl, zh, 0, dt, en ? 1 : 0, 0, m)
}
export async function wasmCollide3DWall(
	vx: number, vy: number, vz: number, nx: number, ny: number, nz: number, e: number, f: number,
): Promise<{ vx: number; vy: number; vz: number; dot: number }> {
	const m = await getWasmKernels()
	const p = scratchPtr(m)
	const dot = m._collide3DWall(vx, vy, vz, nx, ny, nz, e, f, 0, p, p + 4, p + 8)
	return { vx: m.HEAPF32[p >> 2]!, vy: m.HEAPF32[(p >> 2) + 1]!, vz: m.HEAPF32[(p >> 2) + 2]!, dot }
}
export async function wasmBenchElasticity(n: number, seed = 0x12345): Promise<number> {
	return (await getWasmKernels())._benchElasticityWithFalloff(n, seed)
}
export async function wasmBenchHitTestCircle(n: number, seed = 0x12345): Promise<number> {
	return (await getWasmKernels())._benchHitTestCircle(n, seed)
}
export async function wasmBenchHitTestPlane(n: number, seed = 0x12345): Promise<number> {
	return (await getWasmKernels())._benchHitTestPlane(n, seed)
}
export async function wasmBatchElasticity(e: Float32Array, f: Float32Array, v: Float32Array, o: Float32Array): Promise<void> {
	const m = await getWasmKernels()
	const n = e.length
	const { pe, pf, pv, po } = batchPtrs(m, n)
	m.HEAPF32.set(e, pe >> 2); m.HEAPF32.set(f, pf >> 2); m.HEAPF32.set(v, pv >> 2)
	m._batchElasticityWithFalloff(n, pe, pf, pv, po)
	o.set(m.HEAPF32.subarray(po >> 2, (po >> 2) + n))
}
export async function getWasmBatchViews(n: number): Promise<{ e: Float32Array; f: Float32Array; v: Float32Array; o: Float32Array; run: () => void }> {
	const m = await getWasmKernels()
	const { pe, pf, pv, po } = batchPtrs(m, n)
	return {
		e: new Float32Array(m.HEAPF32.buffer, pe, n),
		f: new Float32Array(m.HEAPF32.buffer, pf, n),
		v: new Float32Array(m.HEAPF32.buffer, pv, n),
		o: new Float32Array(m.HEAPF32.buffer, po, n),
		run: () => m._batchElasticityWithFalloff(n, pe, pf, pv, po),
	}
}

let cCache: { cx: Float32Array; cy: Float32Array; cr: Float32Array; zl: Float32Array; zh: Float32Array; oT: Float32Array; oContact: Int32Array; oNx: Float32Array; oNy: Float32Array; oNz: Float32Array; oDist: Float32Array; oBnv: Float32Array; run: (bx: number, by: number, bz: number, vx: number, vy: number, vz: number, br: number, dt: number) => void } | null = null
let cCacheBuf: ArrayBufferLike | null = null
let cCacheInCap = 0
let cCacheOutCap = 0
let cCacheN = 0
export function getWasmBatchHitViewsOutCircle(n: number): {
	cx: Float32Array; cy: Float32Array; cr: Float32Array; zl: Float32Array; zh: Float32Array
	oT: Float32Array; oContact: Int32Array; oNx: Float32Array; oNy: Float32Array; oNz: Float32Array; oDist: Float32Array; oBnv: Float32Array
	run: (bx: number, by: number, bz: number, vx: number, vy: number, vz: number, br: number, dt: number) => void
} {
	const m = getWasmModSync()!
	cPtrs(m, n); cOutPtrs(m, n)
	cCacheN = n
	if (!cCache || cCacheBuf !== m.HEAPF32.buffer || cCacheInCap !== cCap || cCacheOutCap !== cOutCap) {
		cCache = {
			cx: new Float32Array(m.HEAPF32.buffer, cPtr!.cx, cCap),
			cy: new Float32Array(m.HEAPF32.buffer, cPtr!.cy, cCap),
			cr: new Float32Array(m.HEAPF32.buffer, cPtr!.cr, cCap),
			zl: new Float32Array(m.HEAPF32.buffer, cPtr!.zl, cCap),
			zh: new Float32Array(m.HEAPF32.buffer, cPtr!.zh, cCap),
			oT: new Float32Array(m.HEAPF32.buffer, cOut!.oT, cOutCap),
			oContact: new Int32Array(m.HEAP32.buffer, cOut!.oContact, cOutCap),
			oNx: new Float32Array(m.HEAPF32.buffer, cOut!.oNx, cOutCap),
			oNy: new Float32Array(m.HEAPF32.buffer, cOut!.oNy, cOutCap),
			oNz: new Float32Array(m.HEAPF32.buffer, cOut!.oNz, cOutCap),
			oDist: new Float32Array(m.HEAPF32.buffer, cOut!.oDist, cOutCap),
			oBnv: new Float32Array(m.HEAPF32.buffer, cOut!.oBnv, cOutCap),
			run: (bx, by, bz, vx, vy, vz, br, dt) => getWasmModSync()!._batchHitTestCircle(cCacheN, bx, by, bz, vx, vy, vz, br, cPtr!.cx, cPtr!.cy, cPtr!.cr, cPtr!.zl, cPtr!.zh, dt, cOut!.oT, cOut!.oContact, cOut!.oNx, cOut!.oNy, cOut!.oNz, cOut!.oDist, cOut!.oBnv),
		}
		cCacheBuf = m.HEAPF32.buffer
		cCacheInCap = cCap
		cCacheOutCap = cOutCap
	}
	return cCache
}
let pCache: { nx: Float32Array; ny: Float32Array; nz: Float32Array; d: Float32Array; oT: Float32Array; oContact: Int32Array; oNx: Float32Array; oNy: Float32Array; oNz: Float32Array; oDist: Float32Array; oBnv: Float32Array; run: (bx: number, by: number, bz: number, vx: number, vy: number, vz: number, r: number, dt: number) => void } | null = null
let pCacheBuf: ArrayBufferLike | null = null
let pCacheInCap = 0
let pCacheOutCap = 0
let pCacheN = 0
export function getWasmBatchHitViewsOutPlane(n: number): {
	nx: Float32Array; ny: Float32Array; nz: Float32Array; d: Float32Array
	oT: Float32Array; oContact: Int32Array; oNx: Float32Array; oNy: Float32Array; oNz: Float32Array; oDist: Float32Array; oBnv: Float32Array
	run: (bx: number, by: number, bz: number, vx: number, vy: number, vz: number, r: number, dt: number) => void
} {
	const m = getWasmModSync()!
	pPtrs(m, n); pOutPtrs(m, n)
	pCacheN = n
	if (!pCache || pCacheBuf !== m.HEAPF32.buffer || pCacheInCap !== pCap || pCacheOutCap !== pOutCap) {
		pCache = {
			nx: new Float32Array(m.HEAPF32.buffer, pPtr!.nx, pCap),
			ny: new Float32Array(m.HEAPF32.buffer, pPtr!.ny, pCap),
			nz: new Float32Array(m.HEAPF32.buffer, pPtr!.nz, pCap),
			d: new Float32Array(m.HEAPF32.buffer, pPtr!.d, pCap),
			oT: new Float32Array(m.HEAPF32.buffer, pOut!.oT, pOutCap),
			oContact: new Int32Array(m.HEAP32.buffer, pOut!.oContact, pOutCap),
			oNx: new Float32Array(m.HEAPF32.buffer, pOut!.oNx, pOutCap),
			oNy: new Float32Array(m.HEAPF32.buffer, pOut!.oNy, pOutCap),
			oNz: new Float32Array(m.HEAPF32.buffer, pOut!.oNz, pOutCap),
			oDist: new Float32Array(m.HEAPF32.buffer, pOut!.oDist, pOutCap),
			oBnv: new Float32Array(m.HEAPF32.buffer, pOut!.oBnv, pOutCap),
			run: (bx, by, bz, vx, vy, vz, r, dt) => getWasmModSync()!._batchHitTestPlane(pCacheN, bx, by, bz, vx, vy, vz, r, pPtr!.nx, pPtr!.ny, pPtr!.nz, pPtr!.d, dt, pOut!.oT, pOut!.oContact, pOut!.oNx, pOut!.oNy, pOut!.oNz, pOut!.oDist, pOut!.oBnv),
		}
		pCacheBuf = m.HEAPF32.buffer
		pCacheInCap = pCap
		pCacheOutCap = pOutCap
	}
	return pCache
}
let lCache: { lx: Float32Array; ly: Float32Array; zl: Float32Array; zh: Float32Array; oT: Float32Array; oContact: Int32Array; oNx: Float32Array; oNy: Float32Array; oNz: Float32Array; oDist: Float32Array; oBnv: Float32Array; run: (bx: number, by: number, bz: number, vx: number, vy: number, vz: number, br: number, dt: number) => void } | null = null
let lCacheBuf: ArrayBufferLike | null = null
let lCacheInCap = 0
let lCacheOutCap = 0
let lCacheN = 0
export function getWasmBatchHitViewsOutLineZ(n: number): {
	lx: Float32Array; ly: Float32Array; zl: Float32Array; zh: Float32Array
	oT: Float32Array; oContact: Int32Array; oNx: Float32Array; oNy: Float32Array; oNz: Float32Array; oDist: Float32Array; oBnv: Float32Array
	run: (bx: number, by: number, bz: number, vx: number, vy: number, vz: number, br: number, dt: number) => void
} {
	const m = getWasmModSync()!
	lPtrs(m, n); lOutPtrs(m, n)
	lCacheN = n
	if (!lCache || lCacheBuf !== m.HEAPF32.buffer || lCacheInCap !== lCap || lCacheOutCap !== lOutCap) {
		lCache = {
			lx: new Float32Array(m.HEAPF32.buffer, lPtr!.lx, lCap),
			ly: new Float32Array(m.HEAPF32.buffer, lPtr!.ly, lCap),
			zl: new Float32Array(m.HEAPF32.buffer, lPtr!.zl, lCap),
			zh: new Float32Array(m.HEAPF32.buffer, lPtr!.zh, lCap),
			oT: new Float32Array(m.HEAPF32.buffer, lOut!.oT, lOutCap),
			oContact: new Int32Array(m.HEAP32.buffer, lOut!.oContact, lOutCap),
			oNx: new Float32Array(m.HEAPF32.buffer, lOut!.oNx, lOutCap),
			oNy: new Float32Array(m.HEAPF32.buffer, lOut!.oNy, lOutCap),
			oNz: new Float32Array(m.HEAPF32.buffer, lOut!.oNz, lOutCap),
			oDist: new Float32Array(m.HEAPF32.buffer, lOut!.oDist, lOutCap),
			oBnv: new Float32Array(m.HEAPF32.buffer, lOut!.oBnv, lOutCap),
			run: (bx, by, bz, vx, vy, vz, br, dt) => getWasmModSync()!._batchHitTestLineZ(lCacheN, bx, by, bz, vx, vy, vz, br, lPtr!.lx, lPtr!.ly, lPtr!.zl, lPtr!.zh, dt, lOut!.oT, lOut!.oContact, lOut!.oNx, lOut!.oNy, lOut!.oNz, lOut!.oDist, lOut!.oBnv),
		}
		lCacheBuf = m.HEAPF32.buffer
		lCacheInCap = lCap
		lCacheOutCap = lOutCap
	}
	return lCache
}
