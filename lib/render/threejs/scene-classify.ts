// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import type * as THREE from 'three'
import { resolveButtonCode } from './cabinet-buttons.js'
import { isBaked, pendingMapOf, RE_BAKE_MAP, RE_VR } from './material-shared.js'

export const RE_ALPHA_MESH = /armp|ramp|bat_|non[_-]?opaque|plastic|gate/i
const RE_CAB = /vrcab|cabinet|lockbar|pincab|backbox|coindoor/i

// Author spellings vary (`vrcab` vs `vr_cab`, hyphens); fold separators so
// token tests see one canonical form.
export const flatName = (name: string): string => name.toLowerCase().replace(/[_-]/g, '')

/** Cabinet name allowing author separator spellings (`vr_cab`, `vr-cab`, `coin-door`). */
export const isCabName = (name: string): boolean => RE_CAB.test(flatName(name))

/**
 * Author debug leftover (`debug_BLW3`, `debugKicker`, `surface.top-debug_*`):
 * a `debug` token at a name boundary. Matched against the raw name (not the
 * flattened form) so `topdebug` would not match while `top-debug` does.
 */
export const RE_AUTHOR_DEBUG = /(?:^|[^a-zA-Z])debug/i

export const isAuthorDebugName = (name: string | undefined): boolean => !!name && RE_AUTHOR_DEBUG.test(name)

// Playfield glass, not the backglass art of an authored VR backbox (`VRCab_Backglass`).
export const RE_GLASS = /(?<!back)glass/i
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
		isVr: RE_VR.test(meshLower) && !isCabName(meshLower),
		isCab: isCabName(meshLower),
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
// The generated slab itself (three-playfield-mesh-generator), as opposed to
// authored `primitive-*` extras sharing the footprint.
export const isGeneratedPlayfieldBase = (meshName: string): boolean => meshName.toLowerCase() === 'playfield_base'
// The authored playfield collision mesh, by engine/item name (scene nodes
// carry a group prefix, e.g. `primitive-playfield_mesh`). vpx-js renders the
// playfield through the generated base slab instead and force-hides this
// primitive at parse (see forceHidePlayfieldMesh), so the live engine must
// never re-show it: observed live rows report it visible, and showing it
// here would cover the base with a white, mapless quad and z-fight it.
export const isPlayfieldDecoyName = (itemName: string | undefined): boolean =>
	!!itemName && itemName.toLowerCase() === 'playfield_mesh'
// Baked playfield overlay (`BM_Playfield*` primitives): engine bake state from
// classify() (file addBlend/disableLighting flags via `baked`, with
// material/map-name fallback) — never the mesh name alone.
export const isBakedPlayfield = (meshName: string, info: { isMainBake: boolean }): boolean =>
	meshName.toLowerCase().includes('playfield') && info.isMainBake
// Any mesh of the playfield family: the base slab, the baked overlay, and
// authored extras sharing the footprint (decoy quads) — never lightmap/glow
// (`lm_`) quads, walls, or underwalls. `isLm` is mesh-name-only, so this
// stays a pure name check like the rest of the playfield rules above.
export const isPlayfieldFamily = (meshName: string, info: { isLm: boolean }): boolean => {
	const name = meshName.toLowerCase()
	return name.includes('playfield') && !info.isLm && !name.includes('underwall') && !name.includes('wall')
}
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
