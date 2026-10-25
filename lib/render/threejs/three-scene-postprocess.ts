import * as THREE from 'three'
import { getEffectiveCaps, isLowQuality } from '../../util/quality.js'
import { cloneMaterialForWrite, getGlobalEmissionScale } from './material-shared.js'
import {
	isPrimitiveNodeMaterial,
	PRIMITIVE_ADDITIVE_KIND,
	updatePrimitiveAdditive,
} from './nodes/primitive-bdl-node.js'
import { isBakedNodeMaterial, setBakedMap } from './nodes/unshaded-baked-node.js'

export const BAKED_EMISSIVE = 1.0
export const BAKED_ROUGH = 0.75
export const BAKED_METAL = 0.1

const LARGE_TEXTURE_PIXELS = 1_048_576

const RE_BAKE_MAT = /bake/i
const RE_BAKE_MAP = /bake|nestmap/i
const RE_ALPHA_MESH = /armp|ramp|bat_|non[_-]?opaque|plastic|gate/i
const RE_VR = /vr_/i
const RE_CAB = /vrcab|cabinet|lockbar|pincab/i
const RE_GLASS = /glass/i
const RE_LM = /lm_/i
const RE_GI = /gi0|gi1|_gi|gi_/i
const RE_RAMP_FAMILY = /armp|ramp|botramp|rampscrw/i
const RE_NON_OPAQUE = /non[_-]?opaque/i
const RE_KEEP_WHITE =
	/playfield|ball|flipper|bumper|light|dmd|vr_|vrcab|cabinet|lockbar|pincab|ramp|plastic|gate|kicker|target|spinner|button|coin|plunger|bm_/i
const RE_KEEP_DARK =
	/playfield|ball|flipper|bumper|light|dmd|vr_|vrcab|cabinet|lockbar|pincab|ramp|plastic|gate|kicker|target|spinner|button|coin|plunger/i

export const BUTTON_CODE_PATTERNS: { regex: RegExp; code: string }[] = [
	{ regex: /coin/i, code: 'Digit5' },
	{ regex: /start/i, code: 'Digit1' },
	{ regex: /tour/i, code: 'Digit1' },
	{ regex: /plunger|launch/i, code: 'Enter' },
	{ regex: /fire|lockbar/i, code: 'AltLeft' },
	{ regex: /magna.*left|left.*magna/i, code: 'ControlLeft' },
	{ regex: /magna/i, code: 'ControlRight' },
	{ regex: /button/i, code: 'Digit1' },
]

export const resolveButtonCode = (name: string): string | null => {
	const nameLower = String(name ?? '').toLowerCase()
	for (const { regex, code } of BUTTON_CODE_PATTERNS) {
		if (regex.test(nameLower)) return code
	}
	return null
}

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

interface CustomMaterialUserData {
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
	pendingmap?: string
	pendingNormalMap?: string
	pendingEnvMap?: string
	pendingEmissiveMap?: string
	[key: string]: unknown
}

const pendingOf = (material: THREE.Material): string => {
	const userData = material.userData as CustomMaterialUserData | undefined
	const pending = userData?.pendingMap ?? userData?.pendingmap ?? ''
	return String(pending).toLowerCase()
}

const emissionScale = (): number => {
	const scale = getGlobalEmissionScale()
	return Math.max(0.15, Math.min(1, Number.isFinite(scale) ? scale : 1))
}

const isGiOverlay = (name: string): boolean => RE_GI.test(name.toLowerCase())

// vpinball: baked detection is engine-based, not name-based.
// PrimitiveData.disableLightingTop (three-material-generator isBaked) + material/map name fallback
// (RE_BAKE_MAT/RE_BAKE_MAP). Overlay vs main is engine contract addBlend (primitive.cpp:102
// addBlend true => additive unlit via SRC_ALPHA ONE, primitive.cpp:107/1171 alpha/100 HDR).
export const classify = (mesh: string, mat: string, map: string, baked = false, addBlend = false): ClassifyResult => {
	const matLower = mat.toLowerCase()
	const mapLower = map.toLowerCase()
	const meshLower = mesh.toLowerCase()
	const isBakedMat =
		baked ||
		RE_BAKE_MAT.test(matLower) ||
		(RE_BAKE_MAP.test(mapLower) && !mapLower.startsWith('vr_')) ||
		(RE_BAKE_MAP.test(meshLower) && !meshLower.startsWith('vr_') && !meshLower.includes('vr_'))
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

export const isBasePlayfield = (n: string, c: { isBakedMat: boolean }): boolean =>
	n.includes('playfield') && !c.isBakedMat
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

function wrapTexBaked(tex: THREE.Texture | null | undefined): void {
	if (!tex) return
	tex.wrapS = THREE.ClampToEdgeWrapping
	tex.wrapT = THREE.ClampToEdgeWrapping
	tex.generateMipmaps = true
	tex.minFilter = THREE.LinearMipmapLinearFilter
	tex.magFilter = THREE.LinearFilter
	tex.anisotropy = getEffectiveCaps().aniso
	tex.needsUpdate = true
}

function fixBaked(mat: THREE.MeshStandardMaterial, map?: THREE.Texture | null): void {
	const tex = (map as THREE.Texture | undefined) ?? (mat.map as THREE.Texture | undefined)
	if (isBakedNodeMaterial(mat)) {
		if (tex) {
			setBakedMap(mat, tex, tex.name)
			wrapTexBaked(tex)
		}
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
		const tint =
			mat.color && (mat.color as THREE.Color).getHex() !== 0x000000
				? (mat.color as THREE.Color).clone()
				: new THREE.Color(0xffffff)
		if (!mat.emissive) mat.emissive = tint as unknown as THREE.Color
		else (mat.emissive as THREE.Color).copy(tint as THREE.Color)
		mat.emissiveIntensity = BAKED_EMISSIVE * emissionScale()
		;(mat.color as THREE.Color).set(0x000000)
	} else {
		;(mat.color as THREE.Color).set(0xffffff)
		if (mat.emissive) (mat.emissive as THREE.Color).set(0x000000)
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
	const apply = (tex: THREE.Texture | null | undefined) => {
		if (!tex) return
		tex.wrapS = THREE.ClampToEdgeWrapping
		tex.wrapT = THREE.ClampToEdgeWrapping
		tex.generateMipmaps = true
		tex.minFilter = THREE.LinearMipmapLinearFilter
		tex.magFilter = THREE.LinearFilter
		tex.anisotropy = isLowQuality() ? 1 : getEffectiveCaps().aniso
		tex.needsUpdate = true
	}
	apply(mat.map as THREE.Texture | undefined)
	if (mat.emissiveMap && mat.emissiveMap !== mat.map) apply(mat.emissiveMap as THREE.Texture | undefined)
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
	const currentHex = (mat.color as THREE.Color | undefined)?.getHex() ?? 0xffffff
	const tint = currentHex !== 0x000000 ? new THREE.Color(currentHex) : new THREE.Color(0xffffff)
	if (mat.emissive) (mat.emissive as THREE.Color).copy(tint)
	else mat.emissive = tint as unknown as THREE.Color
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
		if (!mat.color) mat.color = new THREE.Color(0x000000) as unknown as THREE.Color
		else (mat.color as THREE.Color).set(0x000000)
		mat.side = THREE.DoubleSide
		mat.toneMapped = false
		mat.roughness = BAKED_ROUGH
		mat.metalness = BAKED_METAL
		wrapTexBaked(tex)
		if (mat.emissiveMap) wrapTexBaked(mat.emissiveMap as THREE.Texture)
		mat.polygonOffset = true
		mat.polygonOffsetFactor = -2
		mat.polygonOffsetUnits = -4
	} else {
		mat.emissiveIntensity = BAKED_EMISSIVE * emissionScale()
		if (!mat.color) mat.color = new THREE.Color(0x000000) as unknown as THREE.Color
		else (mat.color as THREE.Color).set(0x000000)
		mat.side = THREE.DoubleSide
		mat.toneMapped = false
		mat.roughness = BAKED_ROUGH
		mat.metalness = BAKED_METAL
		wrapTexBaked(tex)
		if (mat.emissiveMap) wrapTexBaked(mat.emissiveMap as THREE.Texture)
		if (isMain && !isApron && !isRamp) {
			mat.polygonOffset = true
			mat.polygonOffsetFactor = -1
			mat.polygonOffsetUnits = -1
			mat.depthWrite = true
			mat.transparent = false
			mat.alphaTest = 0
		}
	}
}

export const swipeNudge = (
	dx: number,
	dy: number,
	NUDGE: { left: number; right: number; forward: number; back: number },
): number | null => {
	const adx = Math.abs(dx)
	const ady = Math.abs(dy)
	if (adx > ady * 1.2) return dx < 0 ? NUDGE.left : NUDGE.right
	if (ady > adx * 1.2) return dy < 0 ? NUDGE.forward : NUDGE.back
	return null
}

function isInCabFlipper(obj: THREE.Object3D): boolean {
	for (let cur: THREE.Object3D | null = obj; cur; cur = cur.parent) {
		const nameLower = (cur.name ?? '').toLowerCase()
		if (nameLower.includes('vrcab') && nameLower.includes('flipper')) return true
	}
	return false
}

export function hideCabFlippers(root: THREE.Object3D): number {
	let hidden = 0
	root.traverse(child => {
		if (!isInCabFlipper(child)) return
		if (child.visible !== false) hidden++
		child.visible = false
	})
	return hidden
}

export function showCabFlippers(root: THREE.Object3D): number {
	let shown = 0
	root.traverse(child => {
		if (!isInCabFlipper(child)) return
		if (child.visible === false) {
			child.visible = true
			shown++
		}
	})
	return shown
}

function makeParentsVisible(mesh: THREE.Object3D, root: THREE.Object3D, stats: Record<string, number>): void {
	for (let parent: THREE.Object3D | null = mesh.parent; parent && parent !== root; parent = parent.parent) {
		if (parent.visible === false && !isInCabFlipper(parent)) {
			parent.visible = true
			stats.cabForced++
		}
	}
}

function sanitizeNaN(node: THREE.Object3D, stats: Record<string, number>): void {
	node.traverse(child => {
		const mesh = child as THREE.Mesh
		const pos = mesh.geometry?.attributes?.position as THREE.BufferAttribute | undefined
		if (!mesh.isMesh || !pos?.array) return
		let bad = false
		for (let i = 0; i < pos.array.length; i++) {
			if (!Number.isFinite((pos.array as unknown as number[])[i])) {
				bad = true
				break
			}
		}
		if (!bad) return
		for (let i = 0; i < pos.array.length; i++) {
			if (!Number.isFinite((pos.array as unknown as number[])[i])) (pos.array as unknown as number[])[i] = 0
		}
		pos.needsUpdate = true
		mesh.geometry.computeBoundingSphere()
		mesh.geometry.computeBoundingBox()
		stats.nanFixed++
	})
}

const hideMesh = (obj: THREE.Object3D, statsKey: string | null, stats: Record<string, number>): void => {
	if (!obj.visible) return
	obj.visible = false
	if (statsKey) stats[statsKey]++
}

type PostProcessOptions = {
	viewerMode?: 'viewer' | 'play'
	harnessLog?: (msg: string, level?: string) => void
}

export function postProcessScene(
	node: THREE.Object3D,
	{ viewerMode = 'viewer', harnessLog }: PostProcessOptions = {},
): Record<string, number> {
	const stats: Record<string, number> = {
		vrKept: 0,
		cabForced: 0,
		lightmaps: 0,
		bumperLM: 0,
		vlmFixed: 0,
		metalFixed: 0,
		glass: 0,
		nanFixed: 0,
		nanHidden: 0,
		cabHidden: 0,
		cabFlipperHidden: 0,
		greenHidden: 0,
		playfieldHidden: 0,
	}
	sanitizeNaN(node, stats)
	const bakedCache = new Map<string, THREE.MeshStandardMaterial>()
	const vrCache = new Map<string, THREE.MeshStandardMaterial>()

	const getBaked = (base: THREE.MeshStandardMaterial, meshLower: string): THREE.MeshStandardMaterial => {
		const matName = (base.name ?? '').toLowerCase()
		const pending = pendingOf(base)
		const mapPre = ((base.map as THREE.Texture | undefined)?.name ?? pending ?? '').toLowerCase()
		const baseUserData = base.userData as CustomMaterialUserData | undefined
		const bakedFlag = !!baseUserData?.__isBaked
		const addBlend = !!baseUserData?.__addBlend
		const { isMainBake, isVlmBake, needsAlpha } = classify(meshLower, matName, mapPre, bakedFlag, addBlend)
		const isOverlay = isVlmBake
		const isApron = RE_NON_OPAQUE.test(meshLower)
		const isRamp = RE_RAMP_FAMILY.test(meshLower)
		const alpha = !isMainBake && !isRamp && !isApron && needsAlpha
		const isGI = isOverlay && isGiOverlay(meshLower)
		const role = `${RE_NON_OPAQUE.test(meshLower) ? 'a' : 'x'}|${RE_RAMP_FAMILY.test(meshLower) ? 'r' : 'x'}|${needsAlpha ? 'n' : 'x'}`
		const key = `${base.name}|${(base.map as THREE.Texture | undefined)?.name ?? ''}|${pending}|${isMainBake ? 'main' : isOverlay ? (isGI ? 'overlay_gi' : 'overlay_off') : alpha ? 'alpha' : 'opaque'}|${base.polygonOffset ? `${base.polygonOffsetFactor}/${base.polygonOffsetUnits}` : '0'}|${role}`
		const cached = bakedCache.get(key)
		if (cached) return cached
		const cloned = cloneMaterialForWrite(base) as THREE.MeshStandardMaterial
		const clonedUserData = cloned.userData as CustomMaterialUserData | undefined
		if (isMainBake) {
			fixBaked(cloned, cloned.map as THREE.Texture | undefined)
			if (!isBakedNodeMaterial(cloned) && !cloned.map && pending) {
				;(cloned.color as THREE.Color).set(0x000000)
				if (!cloned.emissive) cloned.emissive = new THREE.Color(0xffffff) as unknown as THREE.Color
				else (cloned.emissive as THREE.Color).set(0xffffff)
				cloned.emissiveIntensity = BAKED_EMISSIVE
			}
			cloned.transparent = false
			if (!(cloned.alphaTest > 0)) cloned.alphaTest = 0
			cloned.depthWrite = true
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
		} else if (isOverlay) {
			fixBaked(cloned, cloned.map as THREE.Texture | undefined)
			const isLit = isGI
			if (clonedUserData?.__primitiveKind === PRIMITIVE_ADDITIVE_KIND) {
				updatePrimitiveAdditive(cloned, { intensity: isLit ? 1.0 : 0 })
			} else {
				cloned.emissiveIntensity = isLit ? 1.0 : 0
			}
			cloned.transparent = true
			cloned.opacity = isLit ? 1.0 : 0
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
			cloned.transparent = alpha && !isApron && !isRamp
			cloned.alphaTest = cloned.transparent ? 0.1 : 0
			cloned.depthWrite = !cloned.transparent
			cloned.opacity = 1
			if (alpha && !isApron && !isRamp) {
				cloned.polygonOffset = true
				cloned.polygonOffsetFactor = -2
				cloned.polygonOffsetUnits = -4
			} else if (isApron || isRamp) {
				cloned.transparent = false
				cloned.alphaTest = 0
				cloned.depthWrite = true
				cloned.polygonOffset = false
				cloned.polygonOffsetFactor = 0
				cloned.polygonOffsetUnits = 0
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

	const getVr = (base: THREE.MeshStandardMaterial, meshLower = ''): THREE.MeshStandardMaterial => {
		const pending = pendingOf(base)
		const isCab = RE_CAB.test(meshLower)
		const key = `${base.name}|${(base.map as THREE.Texture | undefined)?.name ?? pending}|${base.polygonOffset ? `${base.polygonOffsetFactor}/${base.polygonOffsetUnits}` : '0'}|${isCab ? 'cab' : 'vr'}`
		const cached = vrCache.get(key)
		if (cached) return cached
		const cloned = cloneMaterialForWrite(base) as THREE.MeshStandardMaterial
		fixVr(cloned, isCab)
		const hasPending = !!pending && !base.map
		if (hasPending) {
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
			if (cloned.emissive) (cloned.emissive as THREE.Color).set(0x000000)
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

	const forkMaterial = (
		mesh: THREE.Mesh,
		index: number,
		base: THREE.MeshStandardMaterial,
	): THREE.MeshStandardMaterial => {
		const clone = cloneMaterialForWrite(base) as THREE.MeshStandardMaterial
		if (Array.isArray(mesh.material)) (mesh.material as THREE.Material[])[index] = clone
		else mesh.material = clone
		return clone
	}

	node.traverse(child => {
		const mesh = child as THREE.Mesh
		const nameLower = (mesh.name ?? '').toLowerCase()
		if (isInCabFlipper(mesh) && viewerMode === 'play') {
			if (mesh.visible !== false) stats.cabFlipperHidden++
			mesh.visible = false
			return
		}
		if (!mesh.isMesh) {
			if (
				nameLower &&
				(RE_CAB.test(nameLower) || RE_VR.test(nameLower) || resolveButtonCode(nameLower)) &&
				(child as THREE.Object3D).visible === false
			) {
				;(child as THREE.Object3D).visible = true
				stats.cabForced++
			}
			return
		}
		const matForClassify = mesh.material as THREE.Material | THREE.Material[] | undefined
		const firstMat = Array.isArray(matForClassify)
			? (matForClassify[0] as THREE.MeshStandardMaterial | undefined)
			: (matForClassify as THREE.MeshStandardMaterial | undefined)
		const firstUserData = firstMat?.userData as CustomMaterialUserData | undefined
		const matName = (firstMat?.name ?? '').toLowerCase()
		const mapName =
			((firstMat?.map as THREE.Texture | undefined)?.name ?? '').toLowerCase() ||
			String(firstUserData?.__mapName ?? '').toLowerCase() ||
			(firstMat ? pendingOf(firstMat) : '')
		const info = classify(nameLower, matName, mapName, !!firstUserData?.__isBaked, !!firstUserData?.__addBlend)
		if (info.isGlass) {
			hideMesh(mesh, 'glass', stats)
			return
		}
		if (info.isLm || (info.isVlmBake && !info.isMainBake)) {
			stats.lightmaps++
			if (nameLower.includes('bumper')) stats.bumperLM++
		}
		if (
			nameLower.includes('playfield') &&
			!info.isLm &&
			!nameLower.startsWith('primitive-lm_') &&
			!nameLower.startsWith('lm_') &&
			!nameLower.includes('underwall') &&
			!nameLower.includes('wall') &&
			mesh.visible === false
		) {
			mesh.visible = true
			makeParentsVisible(mesh, node, stats)
		}
		if (info.isCab && !mesh.visible) {
			mesh.visible = true
			stats.cabForced++
			makeParentsVisible(mesh, node, stats)
		} else if (info.isVr) {
			if (!mesh.visible) {
				mesh.visible = true
				makeParentsVisible(mesh, node, stats)
			}
			stats.vrKept++
		}
		const buttonCode = resolveButtonCode(nameLower)
		const isButtonMesh = !!buttonCode
		if (isButtonMesh) {
			if (!mesh.visible) {
				mesh.visible = true
				stats.cabForced++
				makeParentsVisible(mesh, node, stats)
			}
			mesh.frustumCulled = false
			mesh.geometry?.computeBoundingSphere?.()
			mesh.geometry?.computeBoundingBox?.()
			const matsBtn = (
				mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : []
			) as THREE.MeshStandardMaterial[]
			for (let matIdx = 0; matIdx < matsBtn.length; matIdx++) {
				const mat = forkMaterial(mesh, matIdx, matsBtn[matIdx] as THREE.MeshStandardMaterial)
				mat.side = THREE.DoubleSide
				mat.polygonOffset = true
				mat.polygonOffsetFactor = -1
				mat.polygonOffsetUnits = -1
				mat.depthWrite = true
				mat.needsUpdate = true
			}
			mesh.renderOrder = 100
			const meshUserData = mesh.userData as CustomMaterialUserData
			meshUserData.isCabinetButton = true
			meshUserData.buttonCode = buttonCode
			makeParentsVisible(mesh, node, stats)
		}
		if (
			!mesh.visible &&
			(info.isMainBake || info.isVlmBake) &&
			!nameLower.includes('underwall') &&
			!nameLower.includes('wall')
		) {
			const matsForGen = (
				mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : []
			) as THREE.MeshStandardMaterial[]
			const hasMap = matsForGen.some(candidateMat => {
				const candidateUserData = candidateMat?.userData as CustomMaterialUserData | undefined
				return !!(candidateMat?.map as unknown) || !!candidateUserData?.__map || !!pendingOf(candidateMat)
			})
			const isWhite =
				matsForGen.length > 0 &&
				matsForGen.every(candidateMat => {
					const candidateUserData = candidateMat?.userData as CustomMaterialUserData | undefined
					const colObj = (candidateMat?.color ??
						candidateUserData?.__uAlbedo?.value ??
						candidateUserData?.__uTint?.value) as THREE.Color | undefined
					const hex = colObj?.getHexString?.()?.toLowerCase()
					const isW = hex === 'ffffff' || colObj?.getHex?.() === 0xffffff
					return isW && !candidateMat?.map && !candidateUserData?.__map && !pendingOf(candidateMat)
				})
			if (hasMap && !isWhite) {
				mesh.visible = true
				stats.cabForced++
				makeParentsVisible(mesh, node, stats)
			}
		}
		if (!mesh.visible) return
		const mats = (
			mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : []
		) as THREE.MeshStandardMaterial[]
		if (
			mats.some(material => {
				const mn = (material?.name ?? '').toLowerCase()
				const col = (material?.color as unknown as THREE.Color)?.getHexString?.()?.toLowerCase()
				return mn.includes('green') || col === '00ff00'
			})
		) {
			hideMesh(mesh, 'greenHidden', stats)
			return
		}
		for (let matIdx = 0; matIdx < mats.length; matIdx++) {
			let mat = mats[matIdx] as THREE.MeshStandardMaterial
			let didFork = false
			const ensureFork = (): THREE.MeshStandardMaterial => {
				if (didFork) return mat
				mat = forkMaterial(mesh, matIdx, mat)
				didFork = true
				return mat
			}
			const matUserData = mat.userData as CustomMaterialUserData | undefined
			const mName = (mat.name ?? '').toLowerCase()
			const mapPath =
				((mat.map as THREE.Texture | undefined)?.name ?? '').toLowerCase() ||
				String(matUserData?.__mapName ?? '').toLowerCase() ||
				pendingOf(mat)
			const matInfo = classify(nameLower, mName, mapPath, !!matUserData?.__isBaked, !!matUserData?.__addBlend)
			if (nameLower.includes('flipper')) {
				if (matInfo.isBakedMat && !mat.map) {
					const flipperMat = ensureFork()
					;(flipperMat.color as THREE.Color).set(0xffffff)
					flipperMat.emissive = new THREE.Color(0x444444) as unknown as THREE.Color
					flipperMat.emissiveIntensity = BAKED_EMISSIVE
					flipperMat.roughness = 0.45
					flipperMat.metalness = 0
					flipperMat.side = THREE.DoubleSide
					flipperMat.needsUpdate = true
				}
				if (mat.map && (mat.map as THREE.Texture).colorSpace !== THREE.SRGBColorSpace) {
					;(mat.map as THREE.Texture).colorSpace = THREE.SRGBColorSpace
					;(mat.map as THREE.Texture).needsUpdate = true
				}
				mesh.castShadow = false
				mesh.receiveShadow = false
				continue
			}
			if (info.isVr || info.isCab) {
				if (isPrimitiveNodeMaterial(mat) && !info.isLm && !info.isVlmBake) {
					mesh.castShadow = false
					mesh.receiveShadow = false
					mesh.frustumCulled = true
					mesh.geometry?.computeBoundingSphere?.()
					mesh.geometry?.computeBoundingBox?.()
					stats.vlmFixed++
					continue
				}
				if (!info.isLm && !info.isVlmBake) {
					const vrMat = getVr(mat, nameLower)
					if (vrMat !== mat) {
						if (Array.isArray(mesh.material)) (mesh.material as THREE.Material[])[matIdx] = vrMat
						else mesh.material = vrMat
						mat = vrMat
					}
					mesh.castShadow = false
					mesh.receiveShadow = false
					mesh.frustumCulled = true
					mesh.geometry?.computeBoundingSphere?.()
					mesh.geometry?.computeBoundingBox?.()
					stats.vlmFixed++
					continue
				}
			}
			if (matInfo.isBakedMat || info.isVlmBake) {
				const bakedMat = getBaked(mat, nameLower)
				if (bakedMat !== mat) {
					if (Array.isArray(mesh.material)) (mesh.material as THREE.Material[])[matIdx] = bakedMat
					else mesh.material = bakedMat
					mat = bakedMat
				}
				if (
					nameLower.includes('bm_playfield') &&
					matInfo.isMainBake &&
					!RE_NON_OPAQUE.test(nameLower) &&
					!RE_RAMP_FAMILY.test(nameLower)
				) {
					mesh.renderOrder = -1
				}
				mesh.castShadow = false
				mesh.receiveShadow = false
				mesh.frustumCulled = true
				mesh.geometry?.computeBoundingSphere?.()
				mesh.geometry?.computeBoundingBox?.()
				stats.vlmFixed++
				if (isLowQuality() && mat.transparent && mat.opacity === 0) {
					hideMesh(mesh, null, stats)
					break
				}
				continue
			}
			const pendingGeneric =
				pendingOf(mat) ||
				matUserData?.pendingNormalMap ||
				matUserData?.pendingEnvMap ||
				matUserData?.pendingEmissiveMap
			const isInsertPending = (() => {
				const pendingLower = String(pendingGeneric).toLowerCase()
				const isRoundInsert = pendingLower.includes('round') && !pendingLower.includes('ground')
				return (
					pendingLower.includes('insert') ||
					pendingLower.includes('rect') ||
					isRoundInsert ||
					pendingLower.includes('dot') ||
					pendingLower.includes('triangle') ||
					pendingLower.includes('flasher') ||
					pendingLower.includes('vrlight')
				)
			})()
			if (pendingGeneric && !mat.map && !mat.emissiveMap && isInsertPending && !isPrimitiveNodeMaterial(mat)) {
				const insertMat = ensureFork()
				insertMat.transparent = true
				insertMat.opacity = 0
				insertMat.depthWrite = false
				insertMat.alphaTest = 0
				insertMat.blending = THREE.NormalBlending
				if (insertMat.emissive) (insertMat.emissive as THREE.Color).set(0x000000)
				insertMat.emissiveIntensity = 0
				insertMat.needsUpdate = true
				continue
			}
			if ((mat.metalness > 0.3 || mat.roughness < 0.4) && !mat.name.toLowerCase().includes('ball')) {
				const metalMat = ensureFork()
				metalMat.roughness = Math.max(metalMat.roughness, 0.75)
				metalMat.metalness = Math.min(metalMat.metalness, 0.1)
				metalMat.needsUpdate = true
				stats.metalFixed++
			}
			if (nameLower.includes('plastic') && !mat.map && !pendingOf(mat)) {
				const plasticMat = ensureFork()
				plasticMat.side = THREE.DoubleSide
				plasticMat.transparent = false
				plasticMat.depthWrite = true
				plasticMat.alphaTest = 0
				plasticMat.opacity = 1
				plasticMat.roughness = Math.max((plasticMat.roughness ?? 0.6) as number, 0.6)
				plasticMat.metalness = Math.min((plasticMat.metalness ?? 0) as number, 0.05)
				plasticMat.needsUpdate = true
			}
			if (mat.map && (mat.map as THREE.Texture).colorSpace !== THREE.SRGBColorSpace) {
				;(mat.map as THREE.Texture).colorSpace = THREE.SRGBColorSpace
				;(mat.map as THREE.Texture).needsUpdate = true
			}
		}
		mesh.receiveShadow = false
		if (info.isVr || info.isCab) {
			mesh.frustumCulled = true
			mesh.geometry?.computeBoundingSphere?.()
			mesh.geometry?.computeBoundingBox?.()
		}
		if (nameLower.includes('plastic') || nameLower.includes('ramp')) {
			const rampMats = (
				Array.isArray(mesh.material) ? mesh.material : [mesh.material]
			) as THREE.MeshStandardMaterial[]
			for (let rampIdx = 0; rampIdx < rampMats.length; rampIdx++) {
				const base = rampMats[rampIdx] as THREE.MeshStandardMaterial
				if (base.side !== THREE.DoubleSide) {
					const rampMat = forkMaterial(mesh, rampIdx, base)
					rampMat.side = THREE.DoubleSide
					rampMat.needsUpdate = true
				}
			}
		}
	})

	let hasBakedPlayfield = false
	node.traverse(child => {
		if ((child as THREE.Mesh).isMesh && (child.name ?? '').toLowerCase().includes('bm_playfield'))
			hasBakedPlayfield = true
	})
	if (hasBakedPlayfield) {
		node.traverse(child => {
			const mesh = child as THREE.Mesh
			if (!mesh.isMesh) return
			const meshName = (mesh.name ?? '').toLowerCase()
			const mat = (
				Array.isArray(mesh.material)
					? (mesh.material as THREE.Material[])[0]
					: (mesh.material as THREE.Material | undefined)
			) as THREE.MeshStandardMaterial | undefined
			const matUserData = mat?.userData as CustomMaterialUserData | undefined
			const matName = (mat?.name ?? '').toLowerCase()
			const mapName = ((mat?.map as THREE.Texture | undefined)?.name ?? '').toLowerCase()
			const pending = mat ? pendingOf(mat) : ''
			const effectiveMap = mapName || pending
			const info = classify(meshName, matName, effectiveMap, !!matUserData?.__isBaked, !!matUserData?.__addBlend)
			const isBase = isBasePlayfield(meshName, info) || meshName === 'primitive-playfield_mesh'
			if (isBase && mesh.visible) hideMesh(mesh, 'playfieldHidden', stats)
			if (meshName.includes('bm_playfield') && mesh.visible === false) {
				mesh.visible = true
				makeParentsVisible(mesh, node, stats)
			}
			if (
				meshName.includes('bm_playfield') &&
				info.isMainBake &&
				!RE_NON_OPAQUE.test(meshName) &&
				!RE_RAMP_FAMILY.test(meshName)
			) {
				mesh.renderOrder = -1
			}
		})
	}

	let hasBakedDuplicate = false
	node.traverse(child => {
		if (
			(child as THREE.Mesh).isMesh &&
			(child as THREE.Mesh).visible &&
			(child.name ?? '').toLowerCase().includes('bm_')
		)
			hasBakedDuplicate = true
	})
	if (hasBakedDuplicate) {
		node.traverse(child => {
			const mesh = child as THREE.Mesh
			if (!mesh.isMesh) return
			const nameLower = (mesh.name ?? '').toLowerCase()
			const isBaked = nameLower.includes('bm_')
			const isDynamicFlipper = nameLower.includes('flipper') && !isBaked
			const isBakedFlipper = isBaked && (nameLower.includes('bat') || nameLower.includes('flipper'))
			if (viewerMode === 'play' && isBakedFlipper && mesh.visible) mesh.visible = false
			else if (viewerMode !== 'play' && isDynamicFlipper && mesh.visible) mesh.visible = false
		})
	}

	node.traverse(child => {
		const mesh = child as THREE.Mesh
		if (!mesh.isMesh || mesh.visible) return
		const meshName = (mesh.name ?? '').toLowerCase()
		const isSling =
			meshName.includes('sling') ||
			/su[0-9]/i.test(meshName) ||
			meshName.includes('_su') ||
			meshName.includes('su_')
		if (!isSling) return
		const mat = (
			Array.isArray(mesh.material)
				? (mesh.material as THREE.Material[])[0]
				: (mesh.material as THREE.Material | undefined)
		) as THREE.MeshStandardMaterial | undefined
		const matUserData = mat?.userData as CustomMaterialUserData | undefined
		const info = mat
			? classify(
					meshName,
					(mat.name ?? '').toLowerCase(),
					((mat.map as THREE.Texture | undefined)?.name ?? '').toLowerCase(),
					!!matUserData?.__isBaked,
					!!matUserData?.__addBlend,
				)
			: ({ isGlass: false, isLm: false, isVlmBake: false, isMainBake: false } as unknown as ClassifyResult)
		if (info.isGlass || info.isLm || (info.isVlmBake && !info.isMainBake)) return
		if (mat && (mat.name ?? '').toLowerCase().includes('green')) return
		mesh.visible = true
		makeParentsVisible(mesh, node, stats)
	})

	node.traverse(child => {
		const mesh = child as THREE.Mesh
		if (!mesh.isMesh || !mesh.visible) return
		const meshName = (mesh.name ?? '').toLowerCase()
		const meshMat = mesh.material as THREE.MeshStandardMaterial | undefined
		const matUserData = meshMat?.userData as CustomMaterialUserData | undefined
		const info = classify(
			meshName,
			(meshMat?.name ?? '').toLowerCase(),
			((meshMat?.map as THREE.Texture | undefined)?.name ?? '').toLowerCase(),
			!!matUserData?.__isBaked,
			!!matUserData?.__addBlend,
		)
		if (info.isBakedMat || info.isVr || info.isCab) return
		if (mesh.geometry?.attributes?.position) {
			const pos = mesh.geometry.attributes.position as THREE.BufferAttribute
			let hasNaN = false
			for (let i = 0; i < pos.count * pos.itemSize; i++) {
				if (!Number.isFinite((pos.array as unknown as number[])[i])) {
					hasNaN = true
					break
				}
			}
			if (hasNaN) {
				hideMesh(mesh, 'nanHidden', stats)
				return
			}
		}
	})

	if (stats.vrKept) harnessLog?.(`[VR] Kept ${stats.vrKept} VR meshes`, 'info')
	if (stats.cabForced) harnessLog?.(`[cabinet] ${stats.cabForced} cab`, 'info')
	if (stats.cabHidden) harnessLog?.(`[cabinet] Hid ${stats.cabHidden} VR/cab meshes in play`, 'info')
	if (stats.cabFlipperHidden) harnessLog?.(`[cabinet] Hid ${stats.cabFlipperHidden} VRCab flipper(s) in play`, 'info')
	if (stats.vlmFixed) harnessLog?.(`[VLM] ${stats.vlmFixed} baked`, 'info')
	if (stats.metalFixed) harnessLog?.(`[mat] ${stats.metalFixed} metals`, 'info')
	if (stats.playfieldHidden)
		harnessLog?.(`[playfield] Hid ${stats.playfieldHidden} base playfield (baked replaced)`, 'info')
	if (stats.greenHidden) harnessLog?.(`[ramp] Hid ${stats.greenHidden} green ramp(s)`, 'info')
	if (stats.glass) harnessLog?.(`[glass] Hid ${stats.glass}`, 'info')

	let whiteWallsHidden = 0
	const keepWhite = (name: string): boolean => RE_KEEP_WHITE.test(name)
	node.traverse(child => {
		const mesh = child as THREE.Mesh
		if (!mesh.isMesh || !mesh.visible) return
		const meshName = (mesh.name ?? '').toLowerCase()
		if (keepWhite(meshName)) return
		const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[]
		if (mats.some(material => !!(material?.map as unknown) || !!pendingOf(material))) return
		if (
			!mats.every(
				material => (material?.color as unknown as THREE.Color)?.getHexString?.()?.toLowerCase() === 'ffffff',
			)
		)
			return
		hideMesh(mesh, null, stats)
		whiteWallsHidden++
	})
	if (whiteWallsHidden) harnessLog?.(`[wall] Hid ${whiteWallsHidden} white untextured stray meshes`, 'info')
	if (stats.nanFixed || stats.nanHidden)
		harnessLog?.(`[sanitize] ${stats.nanFixed} fixed ${stats.nanHidden} hidden`, 'info')

	{
		let darkOccludersHidden = 0
		node.updateMatrixWorld(true)
		const isDarkMat = (material: THREE.MeshStandardMaterial): boolean => {
			if (!material || !(material as unknown as Record<string, unknown>).color) return false
			const hex = (material.color as THREE.Color).getHex()
			const red = (hex >> 16) & 0xff
			const green = (hex >> 8) & 0xff
			const blue = hex & 0xff
			const lum = 0.299 * red + 0.587 * green + 0.114 * blue
			const mapName = ((material.map as THREE.Texture | undefined)?.name ?? '').toLowerCase()
			const pending = pendingOf(material).toLowerCase()
			const isBlackMap = mapName.includes('black') || pending.includes('black')
			return lum < 36 || isBlackMap
		}
		node.traverse(child => {
			const mesh = child as THREE.Mesh
			if (!mesh.isMesh || !mesh.visible) return
			const meshName = (mesh.name ?? '').toLowerCase()
			if (RE_KEEP_DARK.test(meshName)) return
			const mats = (
				Array.isArray(mesh.material) ? mesh.material : [mesh.material]
			) as THREE.MeshStandardMaterial[]
			if (mats.length === 0) return
			if (
				mats.some(
					material =>
						(material.map as THREE.Texture | undefined) &&
						!((material.map as THREE.Texture).name ?? '').toLowerCase().includes('black'),
				)
			)
				return
			if (!mats.every(isDarkMat)) return
			const geo = mesh.geometry
			if (!geo?.attributes?.position) return
			const worldBox = new THREE.Box3().setFromObject(mesh)
			if (worldBox.isEmpty()) return
			const wsx = worldBox.max.x - worldBox.min.x
			const wsy = worldBox.max.y - worldBox.min.y
			if (wsx < 25 || wsy < 25) return
			const wsz = worldBox.max.z - worldBox.min.z
			if (wsz < 4) return
			hideMesh(mesh, null, stats)
			darkOccludersHidden++
		})
		if (darkOccludersHidden) harnessLog?.(`[wall] Hid ${darkOccludersHidden} dark large occluders`, 'info')
	}

	node.traverse(child => {
		const mesh = child as THREE.Mesh
		if (!mesh.isMesh) return
		const meshUserData = mesh.userData as CustomMaterialUserData
		if (meshUserData.isCabinetButton) return
		for (let cur: THREE.Object3D | null = mesh.parent; cur && cur !== node; cur = cur.parent) {
			const curUserData = cur.userData as CustomMaterialUserData | undefined
			if (curUserData?.isCabinetButton && curUserData.buttonCode) {
				meshUserData.isCabinetButton = true
				meshUserData.buttonCode = curUserData.buttonCode
				mesh.frustumCulled = false
				mesh.renderOrder = 100
				break
			}
			const ancCode = resolveButtonCode((cur.name ?? '').toLowerCase())
			if (ancCode) {
				meshUserData.isCabinetButton = true
				meshUserData.buttonCode = ancCode
				mesh.frustumCulled = false
				mesh.renderOrder = 100
				break
			}
		}
	})
	return stats
}

export function ensureProceduralRoom(
	scene: THREE.Scene,
	center: THREE.Vector3,
	size: THREE.Vector3,
	opts: { hasVr?: boolean } = {},
): THREE.Group | null {
	const existing = scene.getObjectByName('vr_procedural_room')
	if (existing) scene.remove(existing)
	if (opts.hasVr) return null
	const maxDim = Math.max(size.x, size.y, size.z)
	const roomWidth = Math.max(1600, maxDim * 8)
	const roomDepth = Math.max(1600, maxDim * 8)
	const roomHeight = Math.max(900, maxDim * 6)
	const group = new THREE.Group()
	group.name = 'vr_procedural_room'
	const floorY = center.z - size.z * 0.6 - 200
	const box = new THREE.Mesh(
		new THREE.BoxGeometry(roomWidth, roomDepth, roomHeight),
		new THREE.MeshStandardMaterial({ color: 0x1c222e, roughness: 0.95, side: THREE.BackSide }),
	)
	box.position.set(center.x, center.y, floorY + roomHeight * 0.5)
	group.add(box)
	const floor = new THREE.Mesh(
		new THREE.PlaneGeometry(roomWidth * 0.98, roomDepth * 0.98),
		new THREE.MeshStandardMaterial({ color: 0x232a3a, roughness: 0.92, side: THREE.DoubleSide }),
	)
	floor.position.set(center.x, center.y, floorY + 0.6)
	group.add(floor)
	const grid = new THREE.GridHelper(Math.min(roomWidth, roomDepth) * 0.96, 16, 0x2f3a5a, 0x1e2535)
	grid.position.set(center.x, center.y, floorY + 1.2)
	grid.rotation.x = Math.PI / 2
	group.add(grid)
	const hemi = new THREE.HemisphereLight(0xffffff, 0x1a1f2e, 0.45)
	hemi.name = 'proc_hemi'
	group.add(hemi)
	scene.add(group)
	return group
}

export type DeferredTexture = {
	getName(): string
	szPath?: string
	width: number
	height: number
	isHdr?: () => boolean
}

export const isDeferred = (tx: DeferredTexture, table: { getPlayfieldMap(): string }): boolean => {
	const texName = tx.getName().toLowerCase()
	const playfieldMap = table.getPlayfieldMap().toLowerCase()
	if (texName === playfieldMap) return false
	if (RE_BAKE_MAP.test(texName) || texName.includes('playfield')) return false
	const filePath = (tx.szPath ?? '').toLowerCase()
	if (filePath.endsWith('.exr') || filePath.endsWith('.hdr') || tx.isHdr?.()) return true
	return tx.width * tx.height > LARGE_TEXTURE_PIXELS
}
