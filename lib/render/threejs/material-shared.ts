import type { Texture as ThreeTexture } from 'three'
import { clonePrimitiveNodeMaterial, isPrimitiveNodeMaterial } from './nodes/primitive-bdl-node.js'
import { cloneBakedNodeMaterial, isBakedNodeMaterial } from './nodes/unshaded-baked-node.js'

export const BALL_METALNESS = 1
export const BALL_ROUGHNESS = 0.08

export const RE_BAKE_MAT = /bake/i
export const RE_BAKE_MAP = /bake|nestmap/i

// VR-room token: `vr` after a boundary (start or non-alphanumeric), as in
// `VRMega`; never the `vr` inside English words (`cover`).
export const RE_VR = /(?:^|[^a-z0-9])vr/i

// Re-exported for the browser loader; the taxonomy lives in texture-tags.ts.
export { RE_PLAYFIELD } from './texture-tags.js'

let _globalEmissionScale = 1
const _emissionListeners = new Set<(scale: number) => void>()

export const onGlobalEmissionScaleChange = (listener: (scale: number) => void) => {
	_emissionListeners.add(listener)
	return () => _emissionListeners.delete(listener)
}

export const setGlobalEmissionScale = (scale: number) => {
	_globalEmissionScale = Number.isFinite(scale) ? Math.max(0.15, Math.min(1, scale)) : 1
	for (const listener of _emissionListeners) listener(_globalEmissionScale)
}
export const getGlobalEmissionScale = () => _globalEmissionScale

export const pendingKeyFor = (key: 'map' | 'normalMap' | 'envMap' | 'emissiveMap'): string =>
	`pending${key.charAt(0).toUpperCase()}${key.slice(1)}`

const TEX_SLOT_KEYS = ['map', 'normalMap', 'envMap', 'emissiveMap'] as const

/** Canonical streaming keys; normalize legacy spellings first. */
export const PENDING_MAP_KEYS: readonly string[] = TEX_SLOT_KEYS.map(pendingKeyFor)

/** Legacy lowercase streaming key. Canonical is `pendingMap`; normalize once at ingestion. */
const LEGACY_PENDING_MAP = 'pendingmap'

/**
 * Normalize the legacy `pendingmap` spelling to the canonical `pendingMap` once,
 * at ingestion. External/table userData may carry either spelling; in-tree writers
 * only ever stash the canonical key (see `pendingKeyFor`).
 */
export function normalizePendingKeys(userData: Record<string, unknown>): void {
	if (typeof userData[LEGACY_PENDING_MAP] === 'string' && typeof userData.pendingMap !== 'string') {
		userData.pendingMap = userData[LEGACY_PENDING_MAP]
	}
	delete userData[LEGACY_PENDING_MAP]
}

/** Single tolerant read of the pending diffuse-map name (normalizes the legacy spelling). */
export function pendingMapOf(userData: Record<string, unknown> | undefined): string {
	if (!userData) return ''
	normalizePendingKeys(userData)
	return typeof userData.pendingMap === 'string' ? userData.pendingMap : ''
}

// Native (Primitive::Render) selects the additive overlay path purely by the file addBlend
// flag. DepthBias is a transparent sort key (RenderDevice::DrawMesh), not a polygon offset,
// and BlendDisableLighting mixes lit/unlit in-shader. Baked-lightmap detection below is a
// vpx-js fallback by material/map name substring for tables whose maps carry no other signal.
export function isBaked(material?: { name: string }, map?: string): boolean {
	if (material && RE_BAKE_MAT.test(material.name)) return true
	if (map && RE_BAKE_MAP.test(map) && !RE_VR.test(map)) return true
	return false
}

/**
 * Fork-safe clone must carry the streaming keys: the texture may arrive after the
 * first script write forks the material, and the streamer/arrival paths match on
 * these names. Dropping them strands the fork mapless forever.
 */
export function copyPendingKeys(from: Record<string, unknown>, to: Record<string, unknown>): void {
	for (const texKey of TEX_SLOT_KEYS) {
		const pendingKey = pendingKeyFor(texKey)
		const value = from[pendingKey]
		if (typeof value === 'string' && value.length > 0) to[pendingKey] = value
	}
}

/**
 * Fork-safe material clone. TSL node materials stash live uniform objects in userData,
 * which the classic three.js clone() flattens through JSON into inert {r,g,b} literals.
 * Always fork through here instead of calling .clone() directly.
 */
export function cloneMaterialForWrite<T>(mat: T): T {
	const material = mat as { clone?: () => unknown } | null | undefined
	if (!material || typeof material.clone !== 'function') return mat
	if (isPrimitiveNodeMaterial(material)) return clonePrimitiveNodeMaterial(material) as T
	if (isBakedNodeMaterial(material)) return cloneBakedNodeMaterial(material) as T
	return material.clone() as T
}

/** Base render state every fork-safe node-material clone carries over. */
export type ForkRenderState = {
	name: string
	transparent: boolean
	depthWrite: boolean
	depthTest: boolean
	blending: number
	side: unknown
	userData: Record<string, unknown>
}

/**
 * Base render-state copy shared by the node-material fork clones (primitive
 * BDL/additive, unlit bake): the factories rebuild the node graph, then the
 * fork keeps the source's draw state plus the streaming keys (see
 * copyPendingKeys). Blend-equation/opacity extras stay with the callers.
 */
export function copyForkedRenderState(source: ForkRenderState, target: ForkRenderState): void {
	target.name = source.name
	target.transparent = source.transparent
	target.depthWrite = source.depthWrite
	target.depthTest = source.depthTest
	target.blending = source.blending
	target.side = source.side
	copyPendingKeys(source.userData, target.userData)
}

/**
 * Shared map-slot swap for TSL node materials (baked + primitive): stashes the
 * map, rebuilds the node graph, and reports whether anything actually changed.
 * No-op unless `isKind` accepts the material and map or name differs.
 */
export function setNodeMapSlot(
	mat: unknown,
	map: ThreeTexture | null,
	name: string | undefined,
	isKind: (mat: unknown) => boolean,
): boolean {
	const target = mat as { userData?: Record<string, unknown>; needsUpdate?: boolean } | null | undefined
	if (!target || !isKind(target)) return false
	const userData = target.userData as Record<string, unknown>
	const nextMap = map ?? null
	if (userData.__map === nextMap) {
		// Same texture object (or still unmapped): the compiled program only
		// depends on the map itself plus, when unmapped, whether a pending name
		// selects the placeholder or the untextured branch. A rename inside one
		// branch must not recompile the program — script color/alpha ride
		// uniforms, and the map slot is untouched.
		const prevName = userData.__mapName as string | undefined
		const sameBranch =
			nextMap !== null || name === undefined || prevName === name || (prevName != null && name != null)
		if (sameBranch) {
			if (name !== undefined) userData.__mapName = name
			return false
		}
	}
	userData.__map = nextMap
	if (name !== undefined) userData.__mapName = name
	if (typeof userData.__rebuild === 'function') (userData.__rebuild as (next: ThreeTexture | null) => void)(nextMap)
	target.needsUpdate = true
	return true
}

/**
 * Legacy `emissiveIntensity` accessor over the `__uIntensity` uniform, for
 * readers that probe additive overlays like classic materials (VLM lightmaps).
 */
export function defineEmissiveIntensityCompat(mat: object): void {
	const getUniform = (host: unknown): { value?: number } | undefined =>
		(host as { userData?: { __uIntensity?: { value?: number } } })?.userData?.__uIntensity
	Object.defineProperty(mat, 'emissiveIntensity', {
		get(this: unknown) {
			return getUniform(this)?.value ?? 1
		},
		set(this: unknown, intensityValue: number) {
			const uniformRef = getUniform(this)
			if (uniformRef) uniformRef.value = intensityValue
		},
		configurable: true,
		enumerable: false,
	})
}
