import type * as THREE from 'three'
import { resolveButtonCode } from './cabinet-buttons.js'
import { isBaked, pendingMapOf, RE_BAKE_MAP, RE_BAKE_MAT, RE_VR } from './material-shared.js'

export { RE_BAKE_MAP, RE_BAKE_MAT, RE_VR }
export const RE_ALPHA_MESH = /armp|ramp|bat_|non[_-]?opaque|plastic|gate/i
export const RE_CAB = /vr_?cab|cabinet|lockbar|pincab|backbox|coin_?door/i

/**
 * VR-room or cabinet content by node name. The showcase viewer keeps these
 * visible despite script-driven hides (desktop VR tables hide their room
 * via `object.visible = 0`); play mode applies script hides faithfully.
 */
export function isShowcaseRoomNode(name: string | undefined): boolean {
	if (!name) return false
	return RE_VR.test(name) || RE_CAB.test(name)
}
export const RE_GLASS = /glass/i
export const RE_LM = /lm_/i
export const RE_GI = /gi0|gi1|_gi|gi_/i
export const RE_RAMP_FAMILY = /armp|ramp|botramp|rampscrw/i
export const RE_NON_OPAQUE = /non[_-]?opaque/i

export type ClassifyResult = {
	isGlass: boolean
	isLm: boolean
	isVr: boolean
	isCab: boolean
	isVlmBake: boolean
	isMainBake: boolean
	isBakedMat: boolean
	needsAlpha: boolean
	isRampFamily: boolean
}

export interface CustomMaterialUserData {
	__primitiveKind?: string
	__addBlend?: boolean
	__isBaked?: boolean
	__bakedNode?: boolean
	__mapName?: string
	__map?: unknown
	__uAlbedo?: { value?: THREE.Color }
	__uTint?: { value?: THREE.Color }
	isCabinetButton?: boolean
	buttonCode?: string
	pendingMap?: string
	/** Legacy lowercase spelling, normalized to `pendingMap` once at ingestion (see `normalizePendingKeys`). */
	pendingmap?: string
	pendingNormalMap?: string
	pendingEnvMap?: string
	pendingEmissiveMap?: string
	[key: string]: unknown
}

// Single cabinet-button predicate: authored button code mapping (coin/start/tour/
// plunger/launch/fire/lockbar/magna/button spellings) plus the post-process flag
// inherited by button children. Batching and BVH both exclude buttons through this.
export const isButtonLike = (name?: string, userData?: CustomMaterialUserData): boolean =>
	!!userData?.isCabinetButton || resolveButtonCode(name ?? '') !== null

// Single pending-map read: the canonical `pendingMapOf` plus the lowercase
// fold this classifier needs (map names match case-insensitively below).
export const pendingOf = (material: THREE.Material): string =>
	pendingMapOf(material?.userData as Record<string, unknown> | undefined).toLowerCase()

export const isGiOverlay = (name: string): boolean => RE_GI.test(name.toLowerCase())

// vpinball: baked detection is engine-based, not name-based.
// PrimitiveData.disableLightingTop (three-material-generator isBaked) + material/map name fallback
// (RE_BAKE_MAT/RE_BAKE_MAP). Overlay vs main is engine contract addBlend (primitive.cpp:102
// addBlend true => additive unlit via SRC_ALPHA ONE, primitive.cpp:107/1171 alpha/100 HDR).
export const classify = (mesh: string, mat: string, map: string, baked = false, addBlend = false): ClassifyResult => {
	const matLower = mat.toLowerCase()
	const meshLower = mesh.toLowerCase()
	// Name-based bake detection is the single `isBaked` definition; only the
	// mesh-name fallback (which needs mesh context `isBaked` lacks) stays here.
	const isBakedMat = baked || isBaked({ name: mat }, map) || (RE_BAKE_MAP.test(meshLower) && !RE_VR.test(meshLower))
	const isRampFamily = RE_RAMP_FAMILY.test(meshLower)
	const isMainBake = isBakedMat && !addBlend
	const isVlmBake = isBakedMat && addBlend
	return {
		isGlass: RE_GLASS.test(meshLower) || RE_GLASS.test(matLower),
		isLm: RE_LM.test(meshLower),
		isVr: RE_VR.test(meshLower) && !RE_CAB.test(meshLower),
		isCab: RE_CAB.test(meshLower),
		isVlmBake,
		isMainBake,
		isBakedMat,
		needsAlpha: RE_ALPHA_MESH.test(meshLower),
		isRampFamily,
	}
}

// Engine base playfield only (lowercased mesh names): the generated slab
// (`playfield_base`, three-playfield-mesh-generator) and the implicit
// upstream `playfield_mesh` primitive (primitive-hit-generator). Author meshes
// that merely contain `playfield` (e.g. `primitive-playfield_wall`) are not
// the base and must stay visible.
const RE_BASE_PLAYFIELD = /^(playfield_base|primitive-playfield_mesh)$/
export const isBasePlayfield = (meshName: string, info: { isBakedMat: boolean }): boolean =>
	RE_BASE_PLAYFIELD.test(meshName.toLowerCase()) && !info.isBakedMat
// Baked playfield overlay (`BM_Playfield*` primitives): engine bake state from
// classify() (file addBlend/disableLighting flags via `baked`, with
// material/map-name fallback) — never the mesh name alone.
export const isBakedPlayfield = (meshName: string, info: { isMainBake: boolean }): boolean =>
	meshName.toLowerCase().includes('playfield') && info.isMainBake
export const isBakedMesh = (info: { isBakedMat: boolean }): boolean => !!info.isBakedMat

export const isBakedMeshByNames = (
	meshName?: string,
	matName?: string,
	mapName?: string,
	baked?: boolean,
	addBlend?: boolean,
) => {
	const info = classify(meshName ?? '', matName ?? '', mapName ?? '', baked ?? false, addBlend ?? false)
	return { ...info, isVrCab: !!info.isCab || !!info.isVr, isBaked: isBakedMesh(info) }
}
