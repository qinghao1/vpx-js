import * as THREE from 'three'
import { cappedAniso, getEffectiveCaps, isLowQuality } from '../../util/quality.js'
import { cloneMaterialForWrite, getGlobalEmissionScale } from './material-shared.js'
import {
	isPrimitiveNodeMaterial,
	PRIMITIVE_ADDITIVE_KIND,
	updatePrimitiveAdditive,
} from './nodes/primitive-bdl-node.js'
import { isBakedNodeMaterial, setBakedMap } from './nodes/unshaded-baked-node.js'
import {
	type ClassifyResult,
	type CustomMaterialUserData,
	classify,
	isGiOverlay,
	pendingOf,
	RE_CAB,
	RE_NON_OPAQUE,
	RE_RAMP_FAMILY,
} from './scene-classify.js'

export const BAKED_EMISSIVE = 1.0
export const BAKED_ROUGH = 0.75
export const BAKED_METAL = 0.1

const emissionScale = (): number => {
	const scale = getGlobalEmissionScale()
	return Math.max(0.15, Math.min(1, Number.isFinite(scale) ? scale : 1))
}

function wrapTexBaked(tex: THREE.Texture | null | undefined, aniso = getEffectiveCaps().aniso): void {
	if (!tex) return
	tex.wrapS = THREE.ClampToEdgeWrapping
	tex.wrapT = THREE.ClampToEdgeWrapping
	tex.generateMipmaps = true
	tex.minFilter = THREE.LinearMipmapLinearFilter
	tex.magFilter = THREE.LinearFilter
	tex.anisotropy = cappedAniso(aniso)
	tex.needsUpdate = true
}

function fixBaked(mat: THREE.MeshStandardMaterial, map?: THREE.Texture | null): void {
	const tex = (map as THREE.Texture | undefined) ?? (mat.map as THREE.Texture | undefined)
	if (isBakedNodeMaterial(mat)) {
		if (tex) {
			setBakedMap(mat, tex, tex.name)
			wrapTexBaked(tex)
		}
		// Baked surfaces render double-sided (mirrors the classic path below):
		// a single-sided baked floor writes no depth from underneath, so
		// depth-tested inserts/glow/DMD leak through it from below.
		mat.side = THREE.DoubleSide
		mat.needsUpdate = true
		return
	}
	if (isPrimitiveNodeMaterial(mat)) {
		if (tex) wrapTexBaked(tex)
		return
	}
	if (tex) {
		mat.map = tex
		mat.emissiveMap = tex
		const tint = mat.color && mat.color.getHex() !== 0x000000 ? mat.color.clone() : new THREE.Color(0xffffff)
		if (!mat.emissive) mat.emissive = tint
		else mat.emissive.copy(tint)
		mat.emissiveIntensity = BAKED_EMISSIVE * emissionScale()
		mat.color.set(0x000000)
	} else {
		mat.color.set(0xffffff)
		if (mat.emissive) mat.emissive.set(0x000000)
		mat.emissiveIntensity = 0
	}
	mat.side = THREE.DoubleSide
	mat.toneMapped = false
	mat.roughness = BAKED_ROUGH
	mat.metalness = BAKED_METAL
	if (mat.map) wrapTexBaked(mat.map as THREE.Texture)
	if (mat.emissiveMap && mat.emissiveMap !== mat.map) wrapTexBaked(mat.emissiveMap as THREE.Texture)
	mat.needsUpdate = true
}

function fixVr(mat: THREE.MeshStandardMaterial, isCab = false): void {
	const aniso = isLowQuality() ? 1 : getEffectiveCaps().aniso
	wrapTexBaked(mat.map as THREE.Texture | undefined, aniso)
	if (mat.emissiveMap && mat.emissiveMap !== mat.map) wrapTexBaked(mat.emissiveMap, aniso)
	mat.side = THREE.DoubleSide
	mat.toneMapped = false
	mat.roughness = BAKED_ROUGH
	mat.metalness = BAKED_METAL
	if (mat.map || isCab) {
		mat.polygonOffset = true
		mat.polygonOffsetFactor = 0
		mat.polygonOffsetUnits = -1
	} else {
		mat.polygonOffset = false
		mat.polygonOffsetFactor = 0
		mat.polygonOffsetUnits = 0
	}
	mat.needsUpdate = true
}

export const wrapBakedTex = wrapTexBaked

export const applyBakedMaterial = (
	mat: THREE.MeshStandardMaterial,
	tex: THREE.Texture,
	info: ClassifyResult,
	meshName?: string,
): void => {
	if (isBakedNodeMaterial(mat)) {
		setBakedMap(mat, tex, tex.name)
		wrapTexBaked(tex)
		// Same floor-occluder rule as fixBaked above: baked node materials
		// arriving late must also end up double-sided.
		mat.side = THREE.DoubleSide
		mat.needsUpdate = true
		return
	}
	const userData = mat.userData as CustomMaterialUserData | undefined
	if (userData?.__primitiveKind === PRIMITIVE_ADDITIVE_KIND) {
		const nameLower = (meshName ?? '').toLowerCase()
		const isLit = isGiOverlay(nameLower)
		updatePrimitiveAdditive(mat, { intensity: isLit ? 1.0 * emissionScale() : 0 })
		mat.opacity = isLit ? 1.0 : 0
		wrapTexBaked(tex)
		mat.needsUpdate = true
		return
	}
	const nameLower = (meshName ?? '').toLowerCase()
	mat.emissiveMap = tex
	const currentHex = mat.color?.getHex() ?? 0xffffff
	const tint = currentHex !== 0x000000 ? new THREE.Color(currentHex) : new THREE.Color(0xffffff)
	if (mat.emissive) mat.emissive.copy(tint)
	else mat.emissive = tint
	const isOverlay = !!userData?.__addBlend || (info.isVlmBake && !info.isMainBake)
	const isMain = !!(info.isMainBake || (info.isBakedMat && !isOverlay))
	const isApron = RE_NON_OPAQUE.test(nameLower)
	const isRamp = RE_RAMP_FAMILY.test(nameLower)
	if (isOverlay) {
		const isLit = isGiOverlay(nameLower)
		mat.emissiveIntensity = isLit ? 1.0 * emissionScale() : 0
		mat.transparent = true
		mat.opacity = isLit ? 1.0 : 0
		mat.blending = THREE.AdditiveBlending
		mat.depthWrite = false
		mat.alphaTest = 0
		mat.polygonOffset = true
		mat.polygonOffsetFactor = -2
		mat.polygonOffsetUnits = -4
	} else {
		mat.emissiveIntensity = BAKED_EMISSIVE * emissionScale()
		if (isMain && !isApron && !isRamp) {
			mat.polygonOffset = true
			mat.polygonOffsetFactor = -1
			mat.polygonOffsetUnits = -1
			mat.depthWrite = true
			mat.transparent = false
			mat.alphaTest = 0
		}
	}
	if (!mat.color) mat.color = new THREE.Color(0x000000)
	else mat.color.set(0x000000)
	mat.side = THREE.DoubleSide
	mat.toneMapped = false
	mat.roughness = BAKED_ROUGH
	mat.metalness = BAKED_METAL
	wrapTexBaked(tex)
	if (mat.emissiveMap) wrapTexBaked(mat.emissiveMap)
}

/** Single role dispatch replacing the three parallel main/overlay/alpha ternaries. */
export type BakedKind = 'main' | 'overlay_gi' | 'overlay_off' | 'alpha' | 'opaque'

export function resolveBakedKind(
	isMainBake: boolean,
	isVlmBake: boolean,
	meshLower: string,
	alpha: boolean,
): BakedKind {
	if (isMainBake) return 'main'
	if (isVlmBake) return isGiOverlay(meshLower) ? 'overlay_gi' : 'overlay_off'
	return alpha ? 'alpha' : 'opaque'
}

/** Cached baked-material resolver (one cache per postprocess run). */
export const createBakedMaterialResolver = (): ((
	base: THREE.MeshStandardMaterial,
	meshLower: string,
) => THREE.MeshStandardMaterial) => {
	const bakedCache = new Map<string, THREE.MeshStandardMaterial>()
	return (base: THREE.MeshStandardMaterial, meshLower: string): THREE.MeshStandardMaterial => {
		const matName = (base.name ?? '').toLowerCase()
		const pending = pendingOf(base)
		const mapPre = ((base.map as THREE.Texture | undefined)?.name ?? pending).toLowerCase()
		const baseUserData = base.userData as CustomMaterialUserData | undefined
		const bakedFlag = !!baseUserData?.__isBaked
		const addBlend = !!baseUserData?.__addBlend
		const { isMainBake, isVlmBake, needsAlpha } = classify(meshLower, matName, mapPre, bakedFlag, addBlend)
		const isApron = RE_NON_OPAQUE.test(meshLower)
		const isRamp = RE_RAMP_FAMILY.test(meshLower)
		const alpha = !isMainBake && !isRamp && !isApron && needsAlpha
		const kind = resolveBakedKind(isMainBake, isVlmBake, meshLower, alpha)
		const role = `${isApron ? 'a' : 'x'}|${isRamp ? 'r' : 'x'}|${needsAlpha ? 'n' : 'x'}`
		const key = `${base.name}|${(base.map as THREE.Texture | undefined)?.name ?? ''}|${pending}|${kind}|${base.polygonOffset ? `${base.polygonOffsetFactor}/${base.polygonOffsetUnits}` : '0'}|${role}`
		const cached = bakedCache.get(key)
		if (cached) return cached
		const cloned = cloneMaterialForWrite(base) as THREE.MeshStandardMaterial
		const clonedUserData = cloned.userData as CustomMaterialUserData | undefined
		if (kind === 'main') {
			fixBaked(cloned, cloned.map as THREE.Texture | undefined)
			if (!isBakedNodeMaterial(cloned) && !cloned.map && pending) {
				cloned.color.set(0x000000)
				if (!cloned.emissive) cloned.emissive = new THREE.Color(0xffffff)
				else cloned.emissive.set(0xffffff)
				cloned.emissiveIntensity = BAKED_EMISSIVE
			}
			cloned.transparent = false
			if (!(cloned.alphaTest > 0)) cloned.alphaTest = 0
			cloned.depthWrite = true
			// Opaque baked surfaces occlude from both sides, whatever the
			// authored backfaces flag says: a single-sided baked floor writes
			// no depth from underneath, so depth-tested inserts/glow/DMD leak
			// through it when the camera moves below the table.
			cloned.side = THREE.DoubleSide
			cloned.opacity = 1
			if (!isApron && !isRamp) {
				cloned.polygonOffset = true
				cloned.polygonOffsetFactor = -1
				cloned.polygonOffsetUnits = -1
			} else {
				cloned.polygonOffset = false
				cloned.polygonOffsetFactor = 0
				cloned.polygonOffsetUnits = 0
			}
			cloned.toneMapped = false
			cloned.needsUpdate = true
		} else if (kind === 'overlay_gi' || kind === 'overlay_off') {
			fixBaked(cloned, cloned.map as THREE.Texture | undefined)
			if (clonedUserData?.__primitiveKind === PRIMITIVE_ADDITIVE_KIND) {
				updatePrimitiveAdditive(cloned, { intensity: kind === 'overlay_gi' ? 1 : 0 })
			} else {
				cloned.emissiveIntensity = kind === 'overlay_gi' ? 1 : 0
			}
			cloned.transparent = true
			cloned.opacity = kind === 'overlay_gi' ? 1 : 0
			cloned.blending = THREE.AdditiveBlending
			cloned.depthWrite = false
			cloned.alphaTest = 0
			cloned.polygonOffset = true
			cloned.polygonOffsetFactor = -2
			cloned.polygonOffsetUnits = -4
			cloned.toneMapped = clonedUserData?.__primitiveKind === PRIMITIVE_ADDITIVE_KIND
			cloned.needsUpdate = true
		} else {
			fixVr(cloned)
			cloned.transparent = alpha
			cloned.alphaTest = alpha ? 0.1 : 0
			cloned.depthWrite = !alpha
			cloned.opacity = 1
			if (alpha) {
				cloned.polygonOffset = true
				cloned.polygonOffsetFactor = -2
				cloned.polygonOffsetUnits = -4
			} else {
				cloned.polygonOffset = false
				cloned.polygonOffsetFactor = 0
				cloned.polygonOffsetUnits = 0
			}
			cloned.needsUpdate = true
		}
		bakedCache.set(key, cloned)
		return cloned
	}
}

/** Cached VR-material resolver (one cache per postprocess run). */
export const createVrMaterialResolver = (): ((
	base: THREE.MeshStandardMaterial,
	meshLower?: string,
) => THREE.MeshStandardMaterial) => {
	const vrCache = new Map<string, THREE.MeshStandardMaterial>()
	return (base: THREE.MeshStandardMaterial, meshLower = ''): THREE.MeshStandardMaterial => {
		const pending = pendingOf(base)
		const isCab = RE_CAB.test(meshLower)
		const key = `${base.name}|${(base.map as THREE.Texture | undefined)?.name ?? pending}|${base.polygonOffset ? `${base.polygonOffsetFactor}/${base.polygonOffsetUnits}` : '0'}|${isCab ? 'cab' : 'vr'}`
		const cached = vrCache.get(key)
		if (cached) return cached
		const cloned = cloneMaterialForWrite(base) as THREE.MeshStandardMaterial
		fixVr(cloned, isCab)
		const hasPending = !!pending && !base.map
		// Baked node materials hide pre-arrival pixels in-shader (placeholder
		// alpha) and the map bind never restores opacity, so skip the zeroing.
		if (hasPending && !isBakedNodeMaterial(base)) {
			if (isCab) {
				cloned.transparent = false
				cloned.opacity = 1
				cloned.depthWrite = true
			} else {
				cloned.transparent = true
				cloned.opacity = 0
				cloned.depthWrite = false
			}
			cloned.alphaTest = 0
			cloned.blending = THREE.NormalBlending
			if (cloned.emissive) cloned.emissive.set(0x000000)
			cloned.emissiveIntensity = 0
		} else {
			cloned.depthWrite = true
			cloned.transparent = false
			cloned.alphaTest = 0
			cloned.opacity = 1
			if (cloned.blending !== THREE.NormalBlending) cloned.blending = THREE.NormalBlending
		}
		cloned.needsUpdate = true
		vrCache.set(key, cloned)
		return cloned
	}
}
