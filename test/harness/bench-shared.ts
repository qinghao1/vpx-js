// Shared bench helpers: timing stats, file probing, VPX candidates, scene-export options, tri counting.
// Plain-Node safe: no relative imports and erasable types only, so .mjs benches can import
// this file directly via `./bench-shared.ts` (arg parsing lives in vpinball-resolver.ts).
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

export interface BenchStats {
	avg: number
	p50: number
	p95: number
	p99: number
	min: number
	max: number
	count: number
}

export function stats(values: number[], digits = 2): BenchStats | null {
	if (values.length === 0) return null
	const sorted = [...values].sort((a, b) => a - b)
	const last = sorted.length - 1
	const pick = (frac: number): number =>
		+(sorted[Math.min(last, Math.floor(sorted.length * frac))] ?? 0).toFixed(digits)
	const avg = sorted.reduce((sum, value) => sum + value, 0) / sorted.length
	return {
		avg: +avg.toFixed(digits),
		p50: pick(0.5),
		p95: pick(0.95),
		p99: pick(0.99),
		min: +(sorted[0] ?? 0).toFixed(digits),
		max: +(sorted[last] ?? 0).toFixed(digits),
		count: sorted.length,
	}
}

export function exists(filePath: string, minSize = 1024): boolean {
	try {
		return fs.existsSync(filePath) && fs.statSync(filePath).size > minSize
	} catch {
		return false
	}
}

function resolveHome(): string {
	if (process.env.HOME) return process.env.HOME
	try {
		return os.homedir()
	} catch {
		return process.cwd()
	}
}

const HOME = resolveHome()

export const VPX_CANDIDATES: string[] = [
	path.resolve('walking_dead.vpx'),
	path.join(HOME, 'Downloads/walking_dead.vpx'),
	path.resolve('test/fixtures/table-empty.vpx'),
]

export const WALKING_DEAD_CANDIDATES: string[] = VPX_CANDIDATES.slice(0, 2)

export function findVpx(): string | null {
	return VPX_CANDIDATES.find(candidate => exists(candidate)) ?? null
}

export function findWalkingDead(): string | null {
	return WALKING_DEAD_CANDIDATES.find(candidate => exists(candidate, 1024 * 1024)) ?? null
}

export function defaultGenOpts(overrides: Record<string, boolean> = {}): Record<string, boolean> {
	return {
		exportPlayfield: true,
		exportPrimitives: true,
		exportFlippers: true,
		exportBumpers: true,
		exportRamps: true,
		exportSurfaces: true,
		exportRubbers: true,
		exportLightBulbs: true,
		exportHitTargets: true,
		exportGates: true,
		exportKickers: true,
		exportTriggers: true,
		exportSpinners: true,
		exportPlungers: true,
		...overrides,
	}
}

export interface TriCount {
	tris: number
	meshes: number
}

// Wall-clock probe wrappers for the bench breakdowns; each preserves the wrapped
// method's sync/async shape and records the elapsed ms of the last call.
export function timedSync(original: (...args: any[]) => any, record: (ms: number) => void): (...args: any[]) => any {
	return function (this: unknown, ...args: any[]): any {
		const start = performance.now()
		const result = original.apply(this, args)
		record(performance.now() - start)
		return result
	}
}

export function timedAsync(
	original: (...args: any[]) => Promise<any>,
	record: (ms: number) => void,
): (...args: any[]) => Promise<any> {
	return async function (this: unknown, ...args: any[]): Promise<any> {
		const start = performance.now()
		const result = await original.apply(this, args)
		record(performance.now() - start)
		return result
	}
}

export function countTris(root: { traverse(work: (node: any) => void): void } | null | undefined): TriCount {
	let tris = 0
	let meshes = 0
	root?.traverse(node => {
		if (node?.isMesh && node.geometry?.attributes?.position) {
			tris += node.geometry.attributes.position.count / 3
			meshes++
		}
	})
	return { tris, meshes }
}

// ---- Shared texture streaming filter (bench-node + ranked-profile) ----

export interface StreamTexture {
	getName(): string
	szPath?: string
	width: number
	height: number
	isHdr?: () => boolean
}

export interface StreamTable {
	getPlayfieldMap(): string
}

/** Ascending footprint order for texture preload lists. */
export function compareByAreaAsc(a: StreamTexture, b: StreamTexture): number {
	return a.width * a.height - b.width * b.height
}

export const RE_BAKE_MAP = /bake|nestmap/i

/** Textures safe to defer: HDR/EXR and large non-bake maps stream after first paint. */
export function isDeferredTexture(tx: StreamTexture, table: StreamTable): boolean {
	const n = tx.getName().toLowerCase()
	const pf = table.getPlayfieldMap().toLowerCase()
	if (n === pf) return false
	if (n.includes('nestmap') || n.includes('bake') || n.includes('playfield') || n === 'blueprintsv2noramps')
		return false
	const p = (tx.szPath || '').toLowerCase()
	if (p.endsWith('.exr') || p.endsWith('.hdr') || tx.isHdr?.()) return true
	return tx.width * tx.height > 1048576
}

/** Lowercased playfield map key, '' when the table exposes none. */
export function getPlayfieldMapKey(table: StreamTable): string {
	try {
		return table.getPlayfieldMap()?.toLowerCase() ?? ''
	} catch {
		return ''
	}
}

/** Move the playfield map to the front so it streams first. Returns its prior index. */
export function movePlayfieldFirst<T extends StreamTexture>(textures: T[], pfMap: string): number {
	if (!pfMap) return -1
	const idx = textures.findIndex(tx => tx.getName().toLowerCase() === pfMap)
	if (idx > 0) {
		const [pfTx] = textures.splice(idx, 1)
		textures.unshift(pfTx)
	}
	return idx
}

export interface UsedTextureNames {
	used: Set<string>
	mainBakeUsed: Set<string>
}

/** Collect texture names referenced (pending or bound) by the generated scene graph. */
export function collectUsedTextureNames(node: { traverse(work: (o: any) => void): void }): UsedTextureNames {
	const used = new Set<string>()
	const mainBakeUsed = new Set<string>()
	node.traverse((o: any) => {
		if (!o.isMesh || !o.material) return
		const n = (o.name || '').toLowerCase()
		const isMainBake = n.includes('playfield') && (n.includes('bm_') || RE_BAKE_MAP.test(n))
		const mats = Array.isArray(o.material) ? o.material : [o.material]
		for (const m of mats) {
			for (const k of ['map', 'normalMap', 'envMap', 'emissiveMap'] as const) {
				const pk = `pending${k[0].toUpperCase()}${k.slice(1)}`
				const pending = (m as any).userData?.[pk]
				if (pending) {
					const key = String(pending).toLowerCase()
					used.add(key)
					if (isMainBake) mainBakeUsed.add(key)
				}
				const tex = (m as any)[k]
				if (tex?.name) {
					const key = String(tex.name)
						.replace(/^texture:/, '')
						.toLowerCase()
					used.add(key)
					if (isMainBake) mainBakeUsed.add(key)
				}
			}
		}
	})
	return { used, mainBakeUsed }
}

/** Small gameplay textures (inserts, flashers, bumpers, balls) are always streamed. */
export function keepAllInserts(n: string): boolean {
	return (
		n.includes('insert') ||
		n.includes('round') ||
		n.includes('rect') ||
		n.includes('switc') ||
		n.includes('vrlight') ||
		n.includes('flasher') ||
		n.includes('scratches') ||
		n.includes('ball_') ||
		n.includes('bumper') ||
		n.includes('kicker') ||
		n.includes('bump')
	)
}

/** Drop unused nestmaps; keep referenced, playfield, and insert textures. */
export function filterStreamTextures<T extends StreamTexture>(
	textures: T[],
	used: Set<string>,
	mainBakeUsed: Set<string>,
	pfMap: string,
): T[] {
	return textures.filter(tx => {
		const n = tx.getName().toLowerCase()
		if (used.has(n) || (pfMap && n === pfMap)) return true
		if (n.startsWith('vlm.nestmap') && !mainBakeUsed.has(n) && n !== pfMap) return false
		if (keepAllInserts(n)) return true
		return false
	})
}

function isCabinetTexture(n: string): boolean {
	return n.includes('vrcab') || n.includes('vr_') || n.includes('lockbar') || n.includes('cabinet')
}

/**
 * Stream order: playfield first, then main-bake maps, then cabinet/VR, then by size.
 * With largestFirstForBakeAndCab the bake/cabinet tiers stream largest-first.
 */
export function compareStreamTextures<T extends StreamTexture>(
	a: T,
	b: T,
	mainBakeUsed: Set<string>,
	pfMap: string,
	largestFirstForBakeAndCab = false,
): number {
	const aN = a.getName().toLowerCase()
	const bN = b.getName().toLowerCase()
	if (aN === pfMap && bN !== pfMap) return -1
	if (bN === pfMap && aN !== pfMap) return 1
	const aMain = mainBakeUsed.has(aN) ? 0 : 1
	const bMain = mainBakeUsed.has(bN) ? 0 : 1
	if (aMain !== bMain) return aMain - bMain
	const aCab = isCabinetTexture(aN) ? 0 : 1
	const bCab = isCabinetTexture(bN) ? 0 : 1
	if (aCab !== bCab) return aCab - bCab
	if (largestFirstForBakeAndCab) {
		if (aMain === 0) return b.width * b.height - a.width * a.height
		if (aCab === 0) return b.width * b.height - a.width * a.height
	}
	return a.width * a.height - b.width * b.height
}
