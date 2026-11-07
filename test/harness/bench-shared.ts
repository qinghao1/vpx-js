// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
// Shared bench helpers: file probing, VPX candidates, scene-export options.
// Plain-Node safe: no relative imports and erasable types only, so .mjs benches can import
// this file directly via `./bench-shared.ts` (arg parsing lives in vpinball-resolver.ts).
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

export function exists(filePath: string, minSize = 1024): boolean {
	try {
		return fs.existsSync(filePath) && fs.statSync(filePath).size > minSize
	} catch {
		return false
	}
}

const HOME = os.homedir()

export const WALKING_DEAD_CANDIDATES: string[] = [
	process.env.WALKING_DEAD_VPX,
	path.resolve('walking_dead.vpx'),
	path.join(HOME, 'Downloads/walking_dead.vpx'),
	path.join(HOME, 'Downloads/walking_dead/walking_dead.vpx'),
	path.resolve('demo-browser/public/ab-tmp/twd.vpx'),
	path.join(HOME, '.cache/vpinball/tables/The Walking Dead (Stern 2014).vpx'),
].filter((candidate): candidate is string => !!candidate)

// The TWD ROM (PinMAME set twd_160h) next to wherever the table usually lives.
export const WALKING_DEAD_ROM_CANDIDATES: string[] = [
	process.env.WALKING_DEAD_ROM,
	path.join(HOME, '.pinmame/roms/twd_160h.zip'),
	path.join(HOME, 'Downloads/twd_160h.zip'),
	path.join(HOME, 'Downloads/walking_dead/twd_160h.zip'),
	path.join(HOME, '.cache/vpinball/pinmame/roms/twd_160h.zip'),
	path.resolve('demo-browser/public/ab-tmp/twd.zip'),
].filter((candidate): candidate is string => !!candidate)

export const VPX_CANDIDATES: string[] = [...WALKING_DEAD_CANDIDATES, path.resolve('test/fixtures/table-empty.vpx')]

export function findWalkingDead(): string | null {
	return WALKING_DEAD_CANDIDATES.find(candidate => exists(candidate, 1024 * 1024)) ?? null
}

export function findWalkingDeadRom(): string | null {
	return WALKING_DEAD_ROM_CANDIDATES.find(candidate => exists(candidate)) ?? null
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
		exportFlashers: true,
		...overrides,
	}
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

export const RE_BAKE_MAP = /bake|nestmap/i

/** Lowercased playfield map key, '' when the table exposes none. */
export function getPlayfieldMapKey(table: StreamTable): string {
	try {
		return table.getPlayfieldMap()?.toLowerCase() ?? ''
	} catch {
		return ''
	}
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
