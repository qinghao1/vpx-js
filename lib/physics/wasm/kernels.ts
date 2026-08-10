type Mod = {
	_malloc: (n: number) => number
	_free: (p: number) => void
	HEAPF32: Float32Array
	HEAP32: Int32Array
	_batchHitTestCircle: (
		n: number,
		bx: number,
		by: number,
		bz: number,
		vx: number,
		vy: number,
		vz: number,
		br: number,
		cx: number,
		cy: number,
		cr: number,
		zl: number,
		zh: number,
		dt: number,
		oT: number,
		oContact: number,
		oNx: number,
		oNy: number,
		oNz: number,
		oDist: number,
		oBnv: number,
	) => void
	_batchHitTestPlane: (
		n: number,
		bx: number,
		by: number,
		bz: number,
		vx: number,
		vy: number,
		vz: number,
		r: number,
		nx: number,
		ny: number,
		nz: number,
		d: number,
		dt: number,
		oT: number,
		oContact: number,
		oNx: number,
		oNy: number,
		oNz: number,
		oDist: number,
		oBnv: number,
	) => void
	_batchHitTestLineZ: (
		n: number,
		bx: number,
		by: number,
		bz: number,
		vx: number,
		vy: number,
		vz: number,
		br: number,
		lx: number,
		ly: number,
		zl: number,
		zh: number,
		dt: number,
		oT: number,
		oContact: number,
		oNx: number,
		oNy: number,
		oNz: number,
		oDist: number,
		oBnv: number,
	) => void
	_batchHitTestPoint: (
		n: number,
		bx: number,
		by: number,
		bz: number,
		vx: number,
		vy: number,
		vz: number,
		r: number,
		px: number,
		py: number,
		pz: number,
		dt: number,
		oT: number,
		oContact: number,
		oNx: number,
		oNy: number,
		oNz: number,
		oDist: number,
		oBnv: number,
	) => void
	_batchHitTestTriangle: (
		n: number,
		bx: number,
		by: number,
		bz: number,
		vx: number,
		vy: number,
		vz: number,
		r: number,
		r0x: number,
		r0y: number,
		r0z: number,
		r1x: number,
		r1y: number,
		r1z: number,
		r2x: number,
		r2y: number,
		r2z: number,
		nx: number,
		ny: number,
		nz: number,
		dt: number,
		oT: number,
		oContact: number,
		oNx: number,
		oNy: number,
		oNz: number,
		oDist: number,
		oBnv: number,
	) => void
	_batchHitTestLineSeg: (
		n: number,
		bx: number,
		by: number,
		bz: number,
		vx: number,
		vy: number,
		vz: number,
		r: number,
		v1x: number,
		v1y: number,
		v2x: number,
		v2y: number,
		nx: number,
		ny: number,
		len: number,
		zl: number,
		zh: number,
		dt: number,
		oT: number,
		oContact: number,
		oNx: number,
		oNy: number,
		oNz: number,
		oDist: number,
		oBnv: number,
	) => void
	_batchHitTestLine3D: (
		n: number,
		bx: number,
		by: number,
		bz: number,
		vx: number,
		vy: number,
		vz: number,
		r: number,
		lx: number,
		ly: number,
		zl: number,
		zh: number,
		m00: number,
		m01: number,
		m02: number,
		m10: number,
		m11: number,
		m12: number,
		m20: number,
		m21: number,
		m22: number,
		dt: number,
		oT: number,
		oContact: number,
		oNx: number,
		oNy: number,
		oNz: number,
		oDist: number,
		oBnv: number,
	) => void
	_batchHitTestPoly: (
		n: number,
		bx: number,
		by: number,
		bz: number,
		vx: number,
		vy: number,
		vz: number,
		r: number,
		nx: number,
		ny: number,
		nz: number,
		r0x: number,
		r0y: number,
		r0z: number,
		numVerts: number,
		vertsX: number,
		vertsY: number,
		dt: number,
		oT: number,
		oContact: number,
		oNx: number,
		oNy: number,
		oNz: number,
		oDist: number,
		oBnv: number,
	) => void
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
				new URL('/wasm/dist/kernels.js', import.meta.url).href,
				new URL('/wasm/kernels/dist/kernels.js', import.meta.url).href,
				new URL('/wasm/kernels.js', import.meta.url).href,
			)
		}
		for (const rel of [
			'../../../wasm/dist/kernels.js',
			'../../../../wasm/dist/kernels.js',
			'../../../wasm/kernels/dist/kernels.js',
			'../../../../wasm/kernels/dist/kernels.js',
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
					mod = (await (create as (o?: unknown) => Promise<Mod>)({ locateFile })) as Mod
				} catch {
					mod = (await (create as () => Promise<Mod>)()) as Mod
				}
				try {
					warmWasmPools(512, 512, 512, 512, 512, 512, 512, 512)
				} catch {}
				return mod!
			} catch (e) {
				lastErr = e
			}
		}
		throw new Error(`WASM kernels not found${lastErr ? `: ${(lastErr as Error).message}` : ''}`)
	})()
	return loading
}

export function isWasmReady(): boolean {
	return !!mod
}
export function getWasmModSync(): Mod | undefined {
	return mod
}

type Pool = { cap: number; ptrs: Record<string, number> | null }
function ensure(m: Mod, count: number, keys: readonly string[], pool: Pool): Record<string, number> {
	if (pool.ptrs && count <= pool.cap) return pool.ptrs
	if (pool.ptrs) for (const k of keys) m._free(pool.ptrs[k]!)
	const pointers: Record<string, number> = {}
	for (const k of keys) pointers[k] = m._malloc(count * 4)
	pool.ptrs = pointers
	pool.cap = count
	return pointers
}

const circleKeys = ['cx', 'cy', 'cr', 'zl', 'zh'] as const
const planeKeys = ['nx', 'ny', 'nz', 'd'] as const
const lineKeys = ['lx', 'ly', 'zl', 'zh'] as const
const pointKeys = ['px', 'py', 'pz'] as const
const triangleKeys = ['r0x', 'r0y', 'r0z', 'r1x', 'r1y', 'r1z', 'r2x', 'r2y', 'r2z', 'nx', 'ny', 'nz'] as const
const lineSegKeys = ['v1x', 'v1y', 'v2x', 'v2y', 'nx', 'ny', 'len', 'zl', 'zh'] as const
const line3DKeys = ['lx', 'ly', 'zl', 'zh', 'm00', 'm01', 'm02', 'm10', 'm11', 'm12', 'm20', 'm21', 'm22'] as const
export const POLY_MAX_VERTS = 32
const polyKeys = ['nx', 'ny', 'nz', 'r0x', 'r0y', 'r0z', 'numVerts'] as const
const polyVertsKeys = ['vertsX', 'vertsY'] as const
const outKeys = ['oT', 'oContact', 'oNx', 'oNy', 'oNz', 'oDist', 'oBnv'] as const

type HitOut = {
	oT: Float32Array
	oContact: Int32Array
	oNx: Float32Array
	oNy: Float32Array
	oNz: Float32Array
	oDist: Float32Array
	oBnv: Float32Array
}
export type CircleViews = {
	cx: Float32Array
	cy: Float32Array
	cr: Float32Array
	zl: Float32Array
	zh: Float32Array
} & HitOut & {
		run: (bx: number, by: number, bz: number, vx: number, vy: number, vz: number, br: number, dt: number) => void
	}
export type PlaneViews = { nx: Float32Array; ny: Float32Array; nz: Float32Array; d: Float32Array } & HitOut & {
		run: (bx: number, by: number, bz: number, vx: number, vy: number, vz: number, r: number, dt: number) => void
	}
export type LineViews = { lx: Float32Array; ly: Float32Array; zl: Float32Array; zh: Float32Array } & HitOut & {
		run: (bx: number, by: number, bz: number, vx: number, vy: number, vz: number, br: number, dt: number) => void
	}
export type PointViews = { px: Float32Array; py: Float32Array; pz: Float32Array } & HitOut & {
		run: (bx: number, by: number, bz: number, vx: number, vy: number, vz: number, r: number, dt: number) => void
	}
export type TriangleViews = {
	r0x: Float32Array
	r0y: Float32Array
	r0z: Float32Array
	r1x: Float32Array
	r1y: Float32Array
	r1z: Float32Array
	r2x: Float32Array
	r2y: Float32Array
	r2z: Float32Array
	nx: Float32Array
	ny: Float32Array
	nz: Float32Array
} & HitOut & {
		run: (bx: number, by: number, bz: number, vx: number, vy: number, vz: number, r: number, dt: number) => void
	}
export type LineSegViews = {
	v1x: Float32Array
	v1y: Float32Array
	v2x: Float32Array
	v2y: Float32Array
	nx: Float32Array
	ny: Float32Array
	len: Float32Array
	zl: Float32Array
	zh: Float32Array
} & HitOut & {
		run: (bx: number, by: number, bz: number, vx: number, vy: number, vz: number, r: number, dt: number) => void
	}
export type Line3DViews = {
	lx: Float32Array
	ly: Float32Array
	zl: Float32Array
	zh: Float32Array
	m00: Float32Array
	m01: Float32Array
	m02: Float32Array
	m10: Float32Array
	m11: Float32Array
	m12: Float32Array
	m20: Float32Array
	m21: Float32Array
	m22: Float32Array
} & HitOut & {
		run: (bx: number, by: number, bz: number, vx: number, vy: number, vz: number, r: number, dt: number) => void
	}
export type PolyViews = {
	nx: Float32Array
	ny: Float32Array
	nz: Float32Array
	r0x: Float32Array
	r0y: Float32Array
	r0z: Float32Array
	numVerts: Int32Array
	vertsX: Float32Array
	vertsY: Float32Array
} & HitOut & {
		run: (bx: number, by: number, bz: number, vx: number, vy: number, vz: number, r: number, dt: number) => void
	}

type Soa<V> = { in: Pool; out: Pool; views: V | null; buf: ArrayBufferLike | null; viewCap: number; n: number }

const circleSoa: Soa<CircleViews> = {
	in: { cap: 0, ptrs: null },
	out: { cap: 0, ptrs: null },
	views: null,
	buf: null,
	viewCap: 0,
	n: 0,
}
const planeSoa: Soa<PlaneViews> = {
	in: { cap: 0, ptrs: null },
	out: { cap: 0, ptrs: null },
	views: null,
	buf: null,
	viewCap: 0,
	n: 0,
}
const lineSoa: Soa<LineViews> = {
	in: { cap: 0, ptrs: null },
	out: { cap: 0, ptrs: null },
	views: null,
	buf: null,
	viewCap: 0,
	n: 0,
}
const pointSoa: Soa<PointViews> = {
	in: { cap: 0, ptrs: null },
	out: { cap: 0, ptrs: null },
	views: null,
	buf: null,
	viewCap: 0,
	n: 0,
}
const triangleSoa: Soa<TriangleViews> = {
	in: { cap: 0, ptrs: null },
	out: { cap: 0, ptrs: null },
	views: null,
	buf: null,
	viewCap: 0,
	n: 0,
}
const lineSegSoa: Soa<LineSegViews> = {
	in: { cap: 0, ptrs: null },
	out: { cap: 0, ptrs: null },
	views: null,
	buf: null,
	viewCap: 0,
	n: 0,
}
const line3DSoa: Soa<Line3DViews> = {
	in: { cap: 0, ptrs: null },
	out: { cap: 0, ptrs: null },
	views: null,
	buf: null,
	viewCap: 0,
	n: 0,
}
const polySoa: Soa<PolyViews> = {
	in: { cap: 0, ptrs: null },
	out: { cap: 0, ptrs: null },
	views: null,
	buf: null,
	viewCap: 0,
	n: 0,
}
const polyVertsPool: Pool = { cap: 0, ptrs: null }

export function warmWasmPools(
	circleCount = 0,
	planeCount = 0,
	lineZCount = 0,
	pointCount = 0,
	triangleCount = 0,
	lineSegCount = 0,
	line3DCount = 0,
	polyCount = 0,
): void {
	const m = getWasmModSync()
	if (!m) return
	if (circleCount) getWasmBatchHitViewsOutCircle(circleCount)
	if (planeCount) getWasmBatchHitViewsOutPlane(planeCount)
	if (lineZCount) getWasmBatchHitViewsOutLineZ(lineZCount)
	if (pointCount) getWasmBatchHitViewsOutPoint(pointCount)
	if (triangleCount) getWasmBatchHitViewsOutTriangle(triangleCount)
	if (lineSegCount) getWasmBatchHitViewsOutLineSeg(lineSegCount)
	if (line3DCount) getWasmBatchHitViewsOutLine3D(line3DCount)
	if (polyCount) getWasmBatchHitViewsOutPoly(polyCount)
}

function tryGet<V extends HitOut & { run: Function }>(soa: Soa<V>, count: number): V | null {
	if (count === 0 || count > soa.in.cap || !soa.views) return null
	const m = getWasmModSync()
	if (!m || soa.buf !== m.HEAPF32.buffer) return null
	soa.n = count
	return soa.views
}

export function tryGetWasmBatchHitViewsOutCircle(count: number): CircleViews | null {
	return tryGet(circleSoa, count)
}
export function tryGetWasmBatchHitViewsOutPlane(count: number): PlaneViews | null {
	return tryGet(planeSoa, count)
}
export function tryGetWasmBatchHitViewsOutLineZ(count: number): LineViews | null {
	return tryGet(lineSoa, count)
}
export function tryGetWasmBatchHitViewsOutPoint(count: number): PointViews | null {
	return tryGet(pointSoa, count)
}
export function tryGetWasmBatchHitViewsOutTriangle(count: number): TriangleViews | null {
	return tryGet(triangleSoa, count)
}
export function tryGetWasmBatchHitViewsOutLineSeg(count: number): LineSegViews | null {
	return tryGet(lineSegSoa, count)
}
export function tryGetWasmBatchHitViewsOutLine3D(count: number): Line3DViews | null {
	return tryGet(line3DSoa, count)
}
export function tryGetWasmBatchHitViewsOutPoly(count: number): PolyViews | null {
	if (count === 0 || count > polySoa.in.cap || count * POLY_MAX_VERTS > polyVertsPool.cap || !polySoa.views)
		return null
	const m = getWasmModSync()
	if (!m || polySoa.buf !== m.HEAPF32.buffer) return null
	polySoa.n = count
	return polySoa.views
}

function allocOut(m: Mod, ptrs: Record<string, number>, cap: number): HitOut {
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

export function getWasmBatchHitViewsOutCircle(count: number): CircleViews {
	const m = getWasmModSync()!
	const ip = ensure(m, count, circleKeys, circleSoa.in)
	const op = ensure(m, count, outKeys, circleSoa.out)
	circleSoa.n = count
	if (!circleSoa.views || circleSoa.buf !== m.HEAPF32.buffer || circleSoa.viewCap !== circleSoa.in.cap) {
		const out = allocOut(m, op, circleSoa.out.cap)
		circleSoa.views = {
			cx: new Float32Array(m.HEAPF32.buffer, ip.cx!, circleSoa.in.cap),
			cy: new Float32Array(m.HEAPF32.buffer, ip.cy!, circleSoa.in.cap),
			cr: new Float32Array(m.HEAPF32.buffer, ip.cr!, circleSoa.in.cap),
			zl: new Float32Array(m.HEAPF32.buffer, ip.zl!, circleSoa.in.cap),
			zh: new Float32Array(m.HEAPF32.buffer, ip.zh!, circleSoa.in.cap),
			...out,
			run: (bx, by, bz, vx, vy, vz, br, dt) =>
				getWasmModSync()!._batchHitTestCircle(
					circleSoa.n,
					bx,
					by,
					bz,
					vx,
					vy,
					vz,
					br,
					ip.cx!,
					ip.cy!,
					ip.cr!,
					ip.zl!,
					ip.zh!,
					dt,
					op.oT!,
					op.oContact!,
					op.oNx!,
					op.oNy!,
					op.oNz!,
					op.oDist!,
					op.oBnv!,
				),
		}
		circleSoa.buf = m.HEAPF32.buffer
		circleSoa.viewCap = circleSoa.in.cap
	}
	return circleSoa.views
}

export function getWasmBatchHitViewsOutPlane(count: number): PlaneViews {
	const m = getWasmModSync()!
	const ip = ensure(m, count, planeKeys, planeSoa.in)
	const op = ensure(m, count, outKeys, planeSoa.out)
	planeSoa.n = count
	if (!planeSoa.views || planeSoa.buf !== m.HEAPF32.buffer || planeSoa.viewCap !== planeSoa.in.cap) {
		const out = allocOut(m, op, planeSoa.out.cap)
		planeSoa.views = {
			nx: new Float32Array(m.HEAPF32.buffer, ip.nx!, planeSoa.in.cap),
			ny: new Float32Array(m.HEAPF32.buffer, ip.ny!, planeSoa.in.cap),
			nz: new Float32Array(m.HEAPF32.buffer, ip.nz!, planeSoa.in.cap),
			d: new Float32Array(m.HEAPF32.buffer, ip.d!, planeSoa.in.cap),
			...out,
			run: (bx, by, bz, vx, vy, vz, r, dt) =>
				getWasmModSync()!._batchHitTestPlane(
					planeSoa.n,
					bx,
					by,
					bz,
					vx,
					vy,
					vz,
					r,
					ip.nx!,
					ip.ny!,
					ip.nz!,
					ip.d!,
					dt,
					op.oT!,
					op.oContact!,
					op.oNx!,
					op.oNy!,
					op.oNz!,
					op.oDist!,
					op.oBnv!,
				),
		}
		planeSoa.buf = m.HEAPF32.buffer
		planeSoa.viewCap = planeSoa.in.cap
	}
	return planeSoa.views
}

export function getWasmBatchHitViewsOutLineZ(count: number): LineViews {
	const m = getWasmModSync()!
	const ip = ensure(m, count, lineKeys, lineSoa.in)
	const op = ensure(m, count, outKeys, lineSoa.out)
	lineSoa.n = count
	if (!lineSoa.views || lineSoa.buf !== m.HEAPF32.buffer || lineSoa.viewCap !== lineSoa.in.cap) {
		const out = allocOut(m, op, lineSoa.out.cap)
		lineSoa.views = {
			lx: new Float32Array(m.HEAPF32.buffer, ip.lx!, lineSoa.in.cap),
			ly: new Float32Array(m.HEAPF32.buffer, ip.ly!, lineSoa.in.cap),
			zl: new Float32Array(m.HEAPF32.buffer, ip.zl!, lineSoa.in.cap),
			zh: new Float32Array(m.HEAPF32.buffer, ip.zh!, lineSoa.in.cap),
			...out,
			run: (bx, by, bz, vx, vy, vz, br, dt) =>
				getWasmModSync()!._batchHitTestLineZ(
					lineSoa.n,
					bx,
					by,
					bz,
					vx,
					vy,
					vz,
					br,
					ip.lx!,
					ip.ly!,
					ip.zl!,
					ip.zh!,
					dt,
					op.oT!,
					op.oContact!,
					op.oNx!,
					op.oNy!,
					op.oNz!,
					op.oDist!,
					op.oBnv!,
				),
		}
		lineSoa.buf = m.HEAPF32.buffer
		lineSoa.viewCap = lineSoa.in.cap
	}
	return lineSoa.views
}

export function getWasmBatchHitViewsOutPoint(count: number): PointViews {
	const m = getWasmModSync()!
	const ip = ensure(m, count, pointKeys, pointSoa.in)
	const op = ensure(m, count, outKeys, pointSoa.out)
	pointSoa.n = count
	if (!pointSoa.views || pointSoa.buf !== m.HEAPF32.buffer || pointSoa.viewCap !== pointSoa.in.cap) {
		const out = allocOut(m, op, pointSoa.out.cap)
		pointSoa.views = {
			px: new Float32Array(m.HEAPF32.buffer, ip.px!, pointSoa.in.cap),
			py: new Float32Array(m.HEAPF32.buffer, ip.py!, pointSoa.in.cap),
			pz: new Float32Array(m.HEAPF32.buffer, ip.pz!, pointSoa.in.cap),
			...out,
			run: (bx, by, bz, vx, vy, vz, r, dt) =>
				getWasmModSync()!._batchHitTestPoint(
					pointSoa.n,
					bx,
					by,
					bz,
					vx,
					vy,
					vz,
					r,
					ip.px!,
					ip.py!,
					ip.pz!,
					dt,
					op.oT!,
					op.oContact!,
					op.oNx!,
					op.oNy!,
					op.oNz!,
					op.oDist!,
					op.oBnv!,
				),
		}
		pointSoa.buf = m.HEAPF32.buffer
		pointSoa.viewCap = pointSoa.in.cap
	}
	return pointSoa.views
}

export function getWasmBatchHitViewsOutTriangle(count: number): TriangleViews {
	const m = getWasmModSync()!
	const ip = ensure(m, count, triangleKeys, triangleSoa.in)
	const op = ensure(m, count, outKeys, triangleSoa.out)
	triangleSoa.n = count
	if (!triangleSoa.views || triangleSoa.buf !== m.HEAPF32.buffer || triangleSoa.viewCap !== triangleSoa.in.cap) {
		const out = allocOut(m, op, triangleSoa.out.cap)
		triangleSoa.views = {
			r0x: new Float32Array(m.HEAPF32.buffer, ip.r0x!, triangleSoa.in.cap),
			r0y: new Float32Array(m.HEAPF32.buffer, ip.r0y!, triangleSoa.in.cap),
			r0z: new Float32Array(m.HEAPF32.buffer, ip.r0z!, triangleSoa.in.cap),
			r1x: new Float32Array(m.HEAPF32.buffer, ip.r1x!, triangleSoa.in.cap),
			r1y: new Float32Array(m.HEAPF32.buffer, ip.r1y!, triangleSoa.in.cap),
			r1z: new Float32Array(m.HEAPF32.buffer, ip.r1z!, triangleSoa.in.cap),
			r2x: new Float32Array(m.HEAPF32.buffer, ip.r2x!, triangleSoa.in.cap),
			r2y: new Float32Array(m.HEAPF32.buffer, ip.r2y!, triangleSoa.in.cap),
			r2z: new Float32Array(m.HEAPF32.buffer, ip.r2z!, triangleSoa.in.cap),
			nx: new Float32Array(m.HEAPF32.buffer, ip.nx!, triangleSoa.in.cap),
			ny: new Float32Array(m.HEAPF32.buffer, ip.ny!, triangleSoa.in.cap),
			nz: new Float32Array(m.HEAPF32.buffer, ip.nz!, triangleSoa.in.cap),
			...out,
			run: (bx, by, bz, vx, vy, vz, r, dt) =>
				getWasmModSync()!._batchHitTestTriangle(
					triangleSoa.n,
					bx,
					by,
					bz,
					vx,
					vy,
					vz,
					r,
					ip.r0x!,
					ip.r0y!,
					ip.r0z!,
					ip.r1x!,
					ip.r1y!,
					ip.r1z!,
					ip.r2x!,
					ip.r2y!,
					ip.r2z!,
					ip.nx!,
					ip.ny!,
					ip.nz!,
					dt,
					op.oT!,
					op.oContact!,
					op.oNx!,
					op.oNy!,
					op.oNz!,
					op.oDist!,
					op.oBnv!,
				),
		}
		triangleSoa.buf = m.HEAPF32.buffer
		triangleSoa.viewCap = triangleSoa.in.cap
	}
	return triangleSoa.views
}

export function getWasmBatchHitViewsOutLineSeg(count: number): LineSegViews {
	const m = getWasmModSync()!
	const ip = ensure(m, count, lineSegKeys, lineSegSoa.in)
	const op = ensure(m, count, outKeys, lineSegSoa.out)
	lineSegSoa.n = count
	if (!lineSegSoa.views || lineSegSoa.buf !== m.HEAPF32.buffer || lineSegSoa.viewCap !== lineSegSoa.in.cap) {
		const out = allocOut(m, op, lineSegSoa.out.cap)
		lineSegSoa.views = {
			v1x: new Float32Array(m.HEAPF32.buffer, ip.v1x!, lineSegSoa.in.cap),
			v1y: new Float32Array(m.HEAPF32.buffer, ip.v1y!, lineSegSoa.in.cap),
			v2x: new Float32Array(m.HEAPF32.buffer, ip.v2x!, lineSegSoa.in.cap),
			v2y: new Float32Array(m.HEAPF32.buffer, ip.v2y!, lineSegSoa.in.cap),
			nx: new Float32Array(m.HEAPF32.buffer, ip.nx!, lineSegSoa.in.cap),
			ny: new Float32Array(m.HEAPF32.buffer, ip.ny!, lineSegSoa.in.cap),
			len: new Float32Array(m.HEAPF32.buffer, ip.len!, lineSegSoa.in.cap),
			zl: new Float32Array(m.HEAPF32.buffer, ip.zl!, lineSegSoa.in.cap),
			zh: new Float32Array(m.HEAPF32.buffer, ip.zh!, lineSegSoa.in.cap),
			...out,
			run: (bx, by, bz, vx, vy, vz, r, dt) =>
				getWasmModSync()!._batchHitTestLineSeg(
					lineSegSoa.n,
					bx,
					by,
					bz,
					vx,
					vy,
					vz,
					r,
					ip.v1x!,
					ip.v1y!,
					ip.v2x!,
					ip.v2y!,
					ip.nx!,
					ip.ny!,
					ip.len!,
					ip.zl!,
					ip.zh!,
					dt,
					op.oT!,
					op.oContact!,
					op.oNx!,
					op.oNy!,
					op.oNz!,
					op.oDist!,
					op.oBnv!,
				),
		}
		lineSegSoa.buf = m.HEAPF32.buffer
		lineSegSoa.viewCap = lineSegSoa.in.cap
	}
	return lineSegSoa.views
}

export function getWasmBatchHitViewsOutLine3D(count: number): Line3DViews {
	const m = getWasmModSync()!
	const ip = ensure(m, count, line3DKeys, line3DSoa.in)
	const op = ensure(m, count, outKeys, line3DSoa.out)
	line3DSoa.n = count
	if (!line3DSoa.views || line3DSoa.buf !== m.HEAPF32.buffer || line3DSoa.viewCap !== line3DSoa.in.cap) {
		const out = allocOut(m, op, line3DSoa.out.cap)
		line3DSoa.views = {
			lx: new Float32Array(m.HEAPF32.buffer, ip.lx!, line3DSoa.in.cap),
			ly: new Float32Array(m.HEAPF32.buffer, ip.ly!, line3DSoa.in.cap),
			zl: new Float32Array(m.HEAPF32.buffer, ip.zl!, line3DSoa.in.cap),
			zh: new Float32Array(m.HEAPF32.buffer, ip.zh!, line3DSoa.in.cap),
			m00: new Float32Array(m.HEAPF32.buffer, ip.m00!, line3DSoa.in.cap),
			m01: new Float32Array(m.HEAPF32.buffer, ip.m01!, line3DSoa.in.cap),
			m02: new Float32Array(m.HEAPF32.buffer, ip.m02!, line3DSoa.in.cap),
			m10: new Float32Array(m.HEAPF32.buffer, ip.m10!, line3DSoa.in.cap),
			m11: new Float32Array(m.HEAPF32.buffer, ip.m11!, line3DSoa.in.cap),
			m12: new Float32Array(m.HEAPF32.buffer, ip.m12!, line3DSoa.in.cap),
			m20: new Float32Array(m.HEAPF32.buffer, ip.m20!, line3DSoa.in.cap),
			m21: new Float32Array(m.HEAPF32.buffer, ip.m21!, line3DSoa.in.cap),
			m22: new Float32Array(m.HEAPF32.buffer, ip.m22!, line3DSoa.in.cap),
			...out,
			run: (bx, by, bz, vx, vy, vz, r, dt) =>
				getWasmModSync()!._batchHitTestLine3D(
					line3DSoa.n,
					bx,
					by,
					bz,
					vx,
					vy,
					vz,
					r,
					ip.lx!,
					ip.ly!,
					ip.zl!,
					ip.zh!,
					ip.m00!,
					ip.m01!,
					ip.m02!,
					ip.m10!,
					ip.m11!,
					ip.m12!,
					ip.m20!,
					ip.m21!,
					ip.m22!,
					dt,
					op.oT!,
					op.oContact!,
					op.oNx!,
					op.oNy!,
					op.oNz!,
					op.oDist!,
					op.oBnv!,
				),
		}
		line3DSoa.buf = m.HEAPF32.buffer
		line3DSoa.viewCap = line3DSoa.in.cap
	}
	return line3DSoa.views
}

export function getWasmBatchHitViewsOutPoly(count: number): PolyViews {
	const m = getWasmModSync()!
	const ip = ensure(m, count, polyKeys, polySoa.in)
	const vertsCount = count * POLY_MAX_VERTS
	const vp = ensure(m, vertsCount, polyVertsKeys, polyVertsPool)
	const op = ensure(m, count, outKeys, polySoa.out)
	polySoa.n = count
	if (
		!polySoa.views ||
		polySoa.buf !== m.HEAPF32.buffer ||
		polySoa.viewCap !== polySoa.in.cap ||
		polySoa.views.vertsX.length !== vertsCount
	) {
		const out = allocOut(m, op, polySoa.out.cap)
		polySoa.views = {
			nx: new Float32Array(m.HEAPF32.buffer, ip.nx!, polySoa.in.cap),
			ny: new Float32Array(m.HEAPF32.buffer, ip.ny!, polySoa.in.cap),
			nz: new Float32Array(m.HEAPF32.buffer, ip.nz!, polySoa.in.cap),
			r0x: new Float32Array(m.HEAPF32.buffer, ip.r0x!, polySoa.in.cap),
			r0y: new Float32Array(m.HEAPF32.buffer, ip.r0y!, polySoa.in.cap),
			r0z: new Float32Array(m.HEAPF32.buffer, ip.r0z!, polySoa.in.cap),
			numVerts: new Int32Array(m.HEAP32.buffer, ip.numVerts!, polySoa.in.cap),
			vertsX: new Float32Array(m.HEAPF32.buffer, vp.vertsX!, vertsCount),
			vertsY: new Float32Array(m.HEAPF32.buffer, vp.vertsY!, vertsCount),
			...out,
			run: (bx, by, bz, vx, vy, vz, r, dt) =>
				getWasmModSync()!._batchHitTestPoly(
					polySoa.n,
					bx,
					by,
					bz,
					vx,
					vy,
					vz,
					r,
					ip.nx!,
					ip.ny!,
					ip.nz!,
					ip.r0x!,
					ip.r0y!,
					ip.r0z!,
					ip.numVerts!,
					vp.vertsX!,
					vp.vertsY!,
					dt,
					op.oT!,
					op.oContact!,
					op.oNx!,
					op.oNy!,
					op.oNz!,
					op.oDist!,
					op.oBnv!,
				),
		}
		polySoa.buf = m.HEAPF32.buffer
		polySoa.viewCap = polySoa.in.cap
	}
	return polySoa.views
}
