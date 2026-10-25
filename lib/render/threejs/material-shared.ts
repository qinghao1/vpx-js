import { DoubleSide, FrontSide } from 'three'
import { clonePrimitiveNodeMaterial, isPrimitiveNodeMaterial } from './nodes/primitive-bdl-node.js'
import { cloneBakedNodeMaterial, isBakedNodeMaterial } from './nodes/unshaded-baked-node.js'

export const BALL_METALNESS = 1
export const BALL_ROUGHNESS = 0.08

export const RE_BAKE_MAT = /bake/i
export const RE_BAKE_MAP = /bake|nestmap/i
export const DISABLE_LIGHTING_THRESHOLD = 0.5

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

// Native (primitive.cpp:1166) selects the additive overlay path purely by the file addBlend
// flag. DepthBias is a transparent sort key (RenderDevice::DrawMesh), not a polygon offset,
// and BlendDisableLighting mixes lit/unlit in-shader — so classification by material/map name
// substrings or depthBias windows is intentionally absent here.
export function isBaked(material?: { name: string }, map?: string, _disableLighting?: number): boolean {
	if (material && RE_BAKE_MAT.test(material.name)) return true
	if (map && RE_BAKE_MAP.test(map) && !map.toLowerCase().startsWith('vr_')) return true
	return false
}

export function materialSide(
	isTransparent: boolean,
	isBall: boolean,
	backfacesEnabled?: boolean,
): typeof DoubleSide | typeof FrontSide {
	return isBall || isTransparent || backfacesEnabled !== false ? DoubleSide : FrontSide
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
