import { DoubleSide, FrontSide } from 'three'

export const BALL_METALNESS = 1
export const BALL_ROUGHNESS = 0.08

export const RE_BAKE_MAT = /bake/i
export const RE_BAKE_MAP = /bake|nestmap/i
export const DISABLE_LIGHTING_THRESHOLD = 0.5

let _globalEmissionScale = 1
const _emissionListeners = new Set<(v: number) => void>()

export const onGlobalEmissionScaleChange = (fn: (v: number) => void) => {
	_emissionListeners.add(fn)
	return () => _emissionListeners.delete(fn)
}

export const setGlobalEmissionScale = (v: number) => {
	_globalEmissionScale = Number.isFinite(v) ? Math.max(0.15, Math.min(1, v)) : 1
	for (const fn of _emissionListeners) fn(_globalEmissionScale)
}
export const getGlobalEmissionScale = () => _globalEmissionScale

export const pendingKeyFor = (key: 'map' | 'normalMap' | 'envMap' | 'emissiveMap'): string =>
	`pending${key.charAt(0).toUpperCase()}${key.slice(1)}`

export function clampDepthBiasUnits(depthBias: number): number {
	if (depthBias === 0) return 0
	const scaled = depthBias / 500
	const clamped = Math.max(-10, Math.min(10, scaled))
	const units = Math.abs(clamped) < 0.25 ? Math.sign(clamped) * 0.25 : clamped
	return Math.abs(depthBias) < 0.5 ? 0 : units
}

export function applyDepthBias(mat: any, depthBias: number): void {
	if (depthBias !== 0) {
		mat.polygonOffset = true
		mat.polygonOffsetFactor = 0
		const units = clampDepthBiasUnits(depthBias)
		mat.polygonOffsetUnits = units
		if (units === 0) mat.polygonOffset = false
	} else {
		// keep baked default if already set; classic leaves false
	}
}

export function isBaked(material?: { name: string }, map?: string, disableLighting?: number): boolean {
	if (disableLighting !== undefined && disableLighting > DISABLE_LIGHTING_THRESHOLD) return true
	if (material && RE_BAKE_MAT.test(material.name)) return true
	if (map && RE_BAKE_MAP.test(map) && !map.toLowerCase().startsWith('vr_')) return true
	return false
}

export function materialSide(
	isTransparent: boolean,
	isBall: boolean,
	backfacesEnabled?: boolean,
): typeof DoubleSide | typeof FrontSide {
	if (isBall || isTransparent) return DoubleSide
	if (backfacesEnabled === false) return FrontSide
	return DoubleSide
}
