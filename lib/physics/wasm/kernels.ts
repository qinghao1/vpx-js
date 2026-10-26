type BatchFn = (
	n: number,
	bx: number,
	by: number,
	bz: number,
	vx: number,
	vy: number,
	vz: number,
	r: number,
	...args: number[]
) => void

type Mod = {
	_malloc: (n: number) => number
	_free: (p: number) => void
	HEAPF32: Float32Array
	HEAP32: Int32Array
	_batchHitTestCircle: BatchFn
	_batchHitTestPlane: BatchFn
	_batchHitTestLineZ: BatchFn
	_batchHitTestPoint: BatchFn
	_batchHitTestTriangle: BatchFn
	_batchHitTestLineSeg: BatchFn
	_batchHitTestLine3D: BatchFn
	_batchHitTestPoly: BatchFn
	_batchElasticityWithFalloff: (n: number, e: number, f: number, v: number, o: number) => void
}

let mod: Mod | undefined
let loading: Promise<Mod> | undefined

export async function getWasmKernels(): Promise<Mod> {
	if (mod) return mod
	if (loading) return loading
	loading = (async () => {
		const candidates: string[] = []
		try {
			// Bare `location` covers window and worker scopes (`window.location` is the same object).
			const origin = typeof location !== 'undefined' ? location.origin : ''
			candidates.push(origin ? `${origin}/wasm/dist/kernels.js` : '/wasm/dist/kernels.js')
		} catch {
			candidates.push('/wasm/dist/kernels.js')
		}
		for (const rel of ['../../../wasm/dist/kernels.js', '../../../../wasm/dist/kernels.js']) {
			const u = new URL(rel, import.meta.url).href
			if (!candidates.includes(u)) candidates.push(u)
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
					warmWasmPools(2048, 2048, 2048, 2048, 2048, 2048, 2048, 2048)
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

export const POLY_MAX_VERTS = 32

type BatchKind = 'circle' | 'plane' | 'lineZ' | 'point' | 'triangle' | 'lineSeg' | 'line3D' | 'poly'
type BatchSpec = {
	fn:
		| '_batchHitTestCircle'
		| '_batchHitTestPlane'
		| '_batchHitTestLineZ'
		| '_batchHitTestPoint'
		| '_batchHitTestTriangle'
		| '_batchHitTestLineSeg'
		| '_batchHitTestLine3D'
		| '_batchHitTestPoly'
	keys: readonly string[]
	intKeys?: readonly string[]
	extraKeys?: readonly string[]
	extraScale?: number
}
/** Per-kind SoA layout. Key order is the WASM argument order: float keys, int keys, extra keys. */
const BATCH_SPECS: Record<BatchKind, BatchSpec> = {
	circle: { fn: '_batchHitTestCircle', keys: ['cx', 'cy', 'cr', 'zl', 'zh'] },
	plane: { fn: '_batchHitTestPlane', keys: ['nx', 'ny', 'nz', 'd'] },
	lineZ: { fn: '_batchHitTestLineZ', keys: ['lx', 'ly', 'zl', 'zh'] },
	point: { fn: '_batchHitTestPoint', keys: ['px', 'py', 'pz'] },
	triangle: {
		fn: '_batchHitTestTriangle',
		keys: ['r0x', 'r0y', 'r0z', 'r1x', 'r1y', 'r1z', 'r2x', 'r2y', 'r2z', 'nx', 'ny', 'nz'],
	},
	lineSeg: { fn: '_batchHitTestLineSeg', keys: ['v1x', 'v1y', 'v2x', 'v2y', 'nx', 'ny', 'len', 'zl', 'zh'] },
	line3D: {
		fn: '_batchHitTestLine3D',
		keys: ['lx', 'ly', 'zl', 'zh', 'm00', 'm01', 'm02', 'm10', 'm11', 'm12', 'm20', 'm21', 'm22'],
	},
	poly: {
		fn: '_batchHitTestPoly',
		keys: ['nx', 'ny', 'nz', 'r0x', 'r0y', 'r0z'],
		intKeys: ['numVerts'],
		extraKeys: ['vertsX', 'vertsY'],
		extraScale: POLY_MAX_VERTS,
	},
}
const BATCH_KINDS: readonly BatchKind[] = ['circle', 'plane', 'lineZ', 'point', 'triangle', 'lineSeg', 'line3D', 'poly']
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
type RunFn = (bx: number, by: number, bz: number, vx: number, vy: number, vz: number, r: number, dt: number) => void
export type CircleViews = {
	cx: Float32Array
	cy: Float32Array
	cr: Float32Array
	zl: Float32Array
	zh: Float32Array
} & HitOut & {
		run: RunFn
	}
export type PlaneViews = { nx: Float32Array; ny: Float32Array; nz: Float32Array; d: Float32Array } & HitOut & {
		run: RunFn
	}
export type LineViews = { lx: Float32Array; ly: Float32Array; zl: Float32Array; zh: Float32Array } & HitOut & {
		run: RunFn
	}
export type PointViews = { px: Float32Array; py: Float32Array; pz: Float32Array } & HitOut & {
		run: RunFn
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
		run: RunFn
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
		run: RunFn
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
		run: RunFn
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
		run: RunFn
	}

type BatchViews = HitOut & { run: RunFn; [key: string]: Float32Array | Int32Array | RunFn }
type Soa = {
	in: Pool
	out: Pool
	extra: Pool
	views: BatchViews | null
	buf: ArrayBufferLike | null
	viewCap: number
	n: number
}
function makeSoa(): Soa {
	return {
		in: { cap: 0, ptrs: null },
		out: { cap: 0, ptrs: null },
		extra: { cap: 0, ptrs: null },
		views: null,
		buf: null,
		viewCap: 0,
		n: 0,
	}
}
const soas: Record<BatchKind, Soa> = {
	circle: makeSoa(),
	plane: makeSoa(),
	lineZ: makeSoa(),
	point: makeSoa(),
	triangle: makeSoa(),
	lineSeg: makeSoa(),
	line3D: makeSoa(),
	poly: makeSoa(),
}

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
	const counts = [
		circleCount,
		planeCount,
		lineZCount,
		pointCount,
		triangleCount,
		lineSegCount,
		line3DCount,
		polyCount,
	]
	for (let i = 0; i < BATCH_KINDS.length; i++) {
		if (counts[i]) getViews(BATCH_KINDS[i]!, counts[i]!)
	}
}

function tryViews<V>(kind: BatchKind, count: number): V | null {
	const spec = BATCH_SPECS[kind]
	const soa = soas[kind]
	if (count === 0 || count > soa.in.cap || !soa.views) return null
	if (spec.extraScale && count * spec.extraScale > soa.extra.cap) return null
	const m = getWasmModSync()
	if (!m || soa.buf !== m.HEAPF32.buffer) return null
	soa.n = count
	return soa.views as unknown as V
}

export function tryGetWasmBatchHitViewsOutCircle(count: number): CircleViews | null {
	return tryViews<CircleViews>('circle', count)
}
export function tryGetWasmBatchHitViewsOutPlane(count: number): PlaneViews | null {
	return tryViews<PlaneViews>('plane', count)
}
export function tryGetWasmBatchHitViewsOutLineZ(count: number): LineViews | null {
	return tryViews<LineViews>('lineZ', count)
}
export function tryGetWasmBatchHitViewsOutPoint(count: number): PointViews | null {
	return tryViews<PointViews>('point', count)
}
export function tryGetWasmBatchHitViewsOutTriangle(count: number): TriangleViews | null {
	return tryViews<TriangleViews>('triangle', count)
}
export function tryGetWasmBatchHitViewsOutLineSeg(count: number): LineSegViews | null {
	return tryViews<LineSegViews>('lineSeg', count)
}
export function tryGetWasmBatchHitViewsOutLine3D(count: number): Line3DViews | null {
	return tryViews<Line3DViews>('line3D', count)
}
export function tryGetWasmBatchHitViewsOutPoly(count: number): PolyViews | null {
	return tryViews<PolyViews>('poly', count)
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

function getViews<V>(kind: BatchKind, count: number): V {
	const spec = BATCH_SPECS[kind]
	const soa = soas[kind]
	const m = getWasmModSync()!
	const inKeys = spec.intKeys ? [...spec.keys, ...spec.intKeys] : spec.keys
	const ip = ensure(m, count, inKeys, soa.in)
	const extraCount = spec.extraScale ? count * spec.extraScale : 0
	const ep = spec.extraKeys ? ensure(m, extraCount, spec.extraKeys, soa.extra) : undefined
	const op = ensure(m, count, outKeys, soa.out)
	soa.n = count
	const staleExtra =
		spec.extraKeys && soa.views && (soa.views[spec.extraKeys[0]!] as Float32Array).length !== extraCount
	if (!soa.views || soa.buf !== m.HEAPF32.buffer || soa.viewCap !== soa.in.cap || staleExtra) {
		const inputs: Record<string, Float32Array | Int32Array> = {}
		for (const key of spec.keys) inputs[key] = new Float32Array(m.HEAPF32.buffer, ip[key]!, soa.in.cap)
		for (const key of spec.intKeys ?? []) inputs[key] = new Int32Array(m.HEAP32.buffer, ip[key]!, soa.in.cap)
		if (spec.extraKeys)
			for (const key of spec.extraKeys) inputs[key] = new Float32Array(m.HEAPF32.buffer, ep![key]!, extraCount)
		const run: RunFn = (bx, by, bz, vx, vy, vz, r, dt) =>
			getWasmModSync()![spec.fn](
				soa.n,
				bx,
				by,
				bz,
				vx,
				vy,
				vz,
				r,
				...inKeys.map(key => ip[key]!),
				...(spec.extraKeys ? spec.extraKeys.map(key => ep![key]!) : []),
				dt,
				...outKeys.map(key => op[key]!),
			)
		soa.views = { ...inputs, ...allocOut(m, op, soa.out.cap), run }
		soa.buf = m.HEAPF32.buffer
		soa.viewCap = soa.in.cap
	}
	return soa.views as unknown as V
}

export function getWasmBatchHitViewsOutCircle(count: number): CircleViews {
	return getViews<CircleViews>('circle', count)
}
export function getWasmBatchHitViewsOutPlane(count: number): PlaneViews {
	return getViews<PlaneViews>('plane', count)
}
export function getWasmBatchHitViewsOutLineZ(count: number): LineViews {
	return getViews<LineViews>('lineZ', count)
}
export function getWasmBatchHitViewsOutPoint(count: number): PointViews {
	return getViews<PointViews>('point', count)
}
export function getWasmBatchHitViewsOutTriangle(count: number): TriangleViews {
	return getViews<TriangleViews>('triangle', count)
}
export function getWasmBatchHitViewsOutLineSeg(count: number): LineSegViews {
	return getViews<LineSegViews>('lineSeg', count)
}
export function getWasmBatchHitViewsOutLine3D(count: number): Line3DViews {
	return getViews<Line3DViews>('line3D', count)
}
export function getWasmBatchHitViewsOutPoly(count: number): PolyViews {
	return getViews<PolyViews>('poly', count)
}
