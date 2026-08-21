// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as THREE from 'three'
import { getEffectiveCaps, isLowQuality } from '../../util/quality.js'
import { getGlobalEmissionScale } from './material-shared.js'

export const BAKED_EMISSIVE = 1.0
export const BAKED_ROUGH = 0.75
export const BAKED_METAL = 0.1

const ANISOTROPY_VR = 8
const LARGE_TEXTURE_PIXELS = 1_048_576

const RE_BAKE_MAT = /bake/i
const RE_BAKE_MAP = /bake|nestmap/i
const RE_ALPHA_MESH = /armp|ramp|bat_|non[_-]?opaque|plastic|gate/i
const RE_VR = /vr_/i
const RE_CAB = /vrcab|cabinet|lockbar|pincab/i
const RE_OUTER = /VRCab_(Cabinet|Backbox|LegsFront|LegsBack)$/i
const RE_GLASS = /glass/i
const RE_LM = /lm_/i
const RE_GI = /gi0|gi1|_gi|gi_/i
const RE_RAMP_FAMILY = /armp|ramp|botramp|rampscrw/i
const RE_NON_OPAQUE = /non[_-]?opaque/i

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
	const n = String(name ?? '').toLowerCase()
	for (const { regex, code } of BUTTON_CODE_PATTERNS) if (regex.test(n)) return code
	return null
}

type ClassifyResult = {
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

const pendingOf = (mat: THREE.Material): string => {
	const ud = (mat as unknown as Record<string, unknown>).userData as Record<string, unknown> | undefined
	const v = (ud?.pendingMap ?? ud?.pendingmap ?? '') as unknown
	return String(v ?? '').toLowerCase()
}

const emissionScale = (): number => {
	const v = getGlobalEmissionScale()
	return Math.max(0.15, Math.min(1, Number.isFinite(v) ? v : 1))
}

const isGiOverlay = (name: string): boolean => RE_GI.test(name.toLowerCase())

// vpinball: baked detection is engine-based, not name-based.
// PrimitiveData.disableLightingTop (three-material-generator isBaked) + material/map name fallback
// (RE_BAKE_MAT/RE_BAKE_MAP). Overlay vs main is engine contract addBlend (primitive.cpp:102
// addBlend true => additive unlit via SRC_ALPHA ONE, primitive.cpp:107/1171 alpha/100 HDR).
export const classify = (mesh: string, mat: string, map: string, baked = false, addBlend = false): ClassifyResult => {
	const m = mat.toLowerCase()
	const mp = map.toLowerCase()
	const me = mesh.toLowerCase()
	const isBakedMat =
		baked ||
		RE_BAKE_MAT.test(m) ||
		(RE_BAKE_MAP.test(mp) && !mp.startsWith('vr_')) ||
		(RE_BAKE_MAP.test(me) && !me.startsWith('vr_') && !me.includes('vr_'))
	const isRampFamily = RE_RAMP_FAMILY.test(me)
	const isMainBake = isBakedMat && !addBlend
	const isVlmBake = isBakedMat && addBlend
	return {
		isGlass: RE_GLASS.test(me) || RE_GLASS.test(m),
		isLm: RE_LM.test(me),
		isVr: RE_VR.test(me) && !RE_CAB.test(me),
		isCab: RE_CAB.test(me),
		isVlmBake,
		isMainBake,
		isBakedMat,
		needsAlpha: RE_ALPHA_MESH.test(me),
		isRampFamily,
	}
}

export const isBasePlayfield = (n: string, c: { isBakedMat: boolean }): boolean =>
	n.includes('playfield') && !c.isBakedMat
export const isBakedMesh = (c: { isBakedMat: boolean }): boolean => !!c.isBakedMat

export const isBakedMeshByNames = (
	meshName?: string,
	matName?: string,
	mapName?: string,
	baked?: boolean,
	addBlend?: boolean,
) => {
	const c = classify(meshName ?? '', matName ?? '', mapName ?? '', baked ?? false, addBlend ?? false)
	return { ...c, isVrCab: !!c.isCab || !!c.isVr, isBaked: isBakedMesh(c) }
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

function fixVr(mat: THREE.MeshStandardMaterial): void {
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
	if (mat.map) {
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
	const nl = (meshName ?? '').toLowerCase()
	mat.emissiveMap = tex
	const cur = (mat.color as THREE.Color | undefined)?.getHex() ?? 0xffffff
	const tint = cur !== 0x000000 ? new THREE.Color(cur) : new THREE.Color(0xffffff)
	if (mat.emissive) (mat.emissive as THREE.Color).copy(tint)
	else mat.emissive = tint as unknown as THREE.Color
	const isOverlay =
		!!(mat.userData as unknown as Record<string, unknown>)?.__addBlend || (info.isVlmBake && !info.isMainBake)
	const isMain = !!(info.isMainBake || (info.isBakedMat && !isOverlay))
	const isApron = RE_NON_OPAQUE.test(nl)
	const isRamp = RE_RAMP_FAMILY.test(nl)
	if (isOverlay) {
		const isLit = isGiOverlay(nl)
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
		const n = (cur.name ?? '').toLowerCase()
		if (n.includes('vrcab') && n.includes('flipper')) return true
	}
	return false
}

const isCabOrVrName = (n: string): boolean => RE_VR.test(n) || RE_CAB.test(n)

function hasCabAncestor(mesh: THREE.Object3D, root: THREE.Object3D): boolean {
	for (let p: THREE.Object3D | null = mesh.parent; p && p !== root; p = p.parent) {
		const pn = (p.name ?? '').toLowerCase()
		if (isCabOrVrName(pn) || RE_OUTER.test(p.name) || RE_CAB.test(pn) || RE_VR.test(pn)) return true
	}
	return false
}

function isKeepInPlay(mesh: THREE.Object3D, root: THREE.Object3D): boolean {
	for (let cur: THREE.Object3D | null = mesh; cur && cur !== root; cur = cur.parent) {
		const n = (cur.name ?? '').toLowerCase()
		if (n.includes('dmd')) return true
		if ((cur as any).userData?.isProceduralDMD) return true
		if (cur.name.startsWith('DMD_')) return true
		if (n.includes('cabinet')) return true
		if (n.includes('backbox')) return true
	}
	const m = (mesh as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
	if (m) {
		const mn = (m.name ?? '').toLowerCase()
		if (mn.includes('dmd')) return true
		const tn = (m.map as THREE.Texture | undefined)?.name?.toLowerCase() ?? ''
		if (tn.includes('dmd')) return true
	}
	return false
}

export function hideCabFlippers(root: THREE.Object3D): number {
	let hidden = 0
	root.traverse(o => {
		if (!isInCabFlipper(o)) return
		if (o.visible !== false) hidden++
		o.visible = false
	})
	return hidden
}

export function showCabFlippers(root: THREE.Object3D): number {
	let shown = 0
	root.traverse(o => {
		if (!isInCabFlipper(o)) return
		if (o.visible === false) {
			o.visible = true
			shown++
		}
	})
	return shown
}

export function hideCabOuter(root: THREE.Object3D): number {
	let hidden = 0
	root.traverse(o => {
		const mesh = o as THREE.Mesh
		if (!mesh.isMesh) return
		if (isKeepInPlay(mesh, root)) return
		const n = (mesh.name ?? '').toLowerCase()
		if (
			n.includes('playfield') ||
			n.includes('apron') ||
			n.includes('button') ||
			n.includes('coin') ||
			n.includes('plunger') ||
			resolveButtonCode(n)
		)
			return
		const isCabAncestor = hasCabAncestor(mesh, root)
		const mat = mesh.material as THREE.Material | undefined as THREE.MeshStandardMaterial | undefined
		const c = classify(
			n,
			(mat?.name ?? '').toLowerCase(),
			((mat?.map as THREE.Texture | undefined)?.name ?? '').toLowerCase(),
			!!(mat?.userData as unknown as Record<string, unknown>)?.__isBaked,
		)
		if (c.isCab || c.isVr || RE_OUTER.test(mesh.name) || isCabOrVrName(n) || isCabAncestor) {
			if (mesh.visible !== false) {
				mesh.visible = false
				hidden++
			}
		}
	})
	return hidden
}

export function showCabOuter(root: THREE.Object3D): number {
	let shown = 0
	root.traverse(o => {
		const mesh = o as THREE.Mesh
		if (!mesh.isMesh) return
		const n = (mesh.name ?? '').toLowerCase()
		if (n.includes('playfield') || n.includes('apron')) return
		const isCabAncestor = hasCabAncestor(mesh, root)
		const mat = mesh.material as THREE.Material | undefined as THREE.MeshStandardMaterial | undefined
		const c = classify(
			n,
			(mat?.name ?? '').toLowerCase(),
			((mat?.map as THREE.Texture | undefined)?.name ?? '').toLowerCase(),
			!!(mat?.userData as unknown as Record<string, unknown>)?.__isBaked,
		)
		if (c.isCab || c.isVr || RE_OUTER.test(mesh.name) || isCabOrVrName(n) || isCabAncestor) {
			if (mesh.visible === false) {
				mesh.visible = true
				shown++
			}
		}
	})
	return shown
}

export function hideCab(root: THREE.Object3D): number {
	return hideCabFlippers(root) + hideCabOuter(root)
}

export function showCab(root: THREE.Object3D): number {
	return showCabFlippers(root) + showCabOuter(root)
}

function makeParentsVisible(mesh: THREE.Object3D, root: THREE.Object3D, stats: Record<string, number>): void {
	for (let p: THREE.Object3D | null = mesh.parent; p && p !== root; p = p.parent) {
		if (p.visible === false && !isInCabFlipper(p)) {
			p.visible = true
			stats.cabForced++
		}
	}
}

function sanitizeNaN(node: THREE.Object3D, stats: Record<string, number>): void {
	node.traverse(o => {
		const mesh = o as THREE.Mesh
		const pos = mesh.geometry?.attributes?.position as THREE.BufferAttribute | undefined
		if (!mesh.isMesh || !pos?.array) return
		let bad = false
		for (let i = 0; i < pos.array.length; i++)
			if (!Number.isFinite((pos.array as unknown as number[])[i])) {
				bad = true
				break
			}
		if (!bad) return
		for (let i = 0; i < pos.array.length; i++)
			if (!Number.isFinite((pos.array as unknown as number[])[i])) (pos.array as unknown as number[])[i] = 0
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
		const bakedFlag = !!(base.userData as unknown as Record<string, unknown>)?.__isBaked
		const addBlend = !!(base.userData as unknown as Record<string, unknown>)?.__addBlend
		const { isMainBake, isVlmBake, needsAlpha } = classify(meshLower, matName, mapPre, bakedFlag, addBlend)
		const isOverlay = isVlmBake
		const isApron = RE_NON_OPAQUE.test(meshLower)
		const isRamp = RE_RAMP_FAMILY.test(meshLower)
		const alpha = !isMainBake && !isRamp && !isApron && needsAlpha
		const isGI = isOverlay && isGiOverlay(meshLower)
		const key = `${base.name}|${(base.map as THREE.Texture | undefined)?.name ?? ''}|${pending}|${isMainBake ? 'main' : isOverlay ? (isGI ? 'overlay_gi' : 'overlay_off') : alpha ? 'alpha' : 'opaque'}|${base.polygonOffset ? `${base.polygonOffsetFactor}/${base.polygonOffsetUnits}` : '0'}`
		const cached = bakedCache.get(key)
		if (cached) return cached
		const cloned = base.clone() as THREE.MeshStandardMaterial
		if (isMainBake) {
			fixBaked(cloned, cloned.map as THREE.Texture | undefined)
			if (!cloned.map && pending) {
				;(cloned.color as THREE.Color).set(0x000000)
				if (!cloned.emissive) cloned.emissive = new THREE.Color(0xffffff) as unknown as THREE.Color
				else (cloned.emissive as THREE.Color).set(0xffffff)
				cloned.emissiveIntensity = BAKED_EMISSIVE
			}
			cloned.transparent = false
			cloned.alphaTest = 0
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
			cloned.emissiveIntensity = isLit ? 1.0 : 0
			cloned.transparent = true
			cloned.opacity = isLit ? 1.0 : 0
			cloned.blending = THREE.AdditiveBlending
			cloned.depthWrite = false
			cloned.alphaTest = 0
			cloned.polygonOffset = true
			cloned.polygonOffsetFactor = -2
			cloned.polygonOffsetUnits = -4
			cloned.toneMapped = false
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
		const cloned = base.clone() as THREE.MeshStandardMaterial
		fixVr(cloned)
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
		const clone = base.clone() as THREE.MeshStandardMaterial
		if (Array.isArray(mesh.material)) (mesh.material as THREE.Material[])[index] = clone
		else mesh.material = clone
		return clone
	}

	node.traverse(o => {
		const mesh = o as THREE.Mesh
		const n = (mesh.name ?? '').toLowerCase()
		if (isInCabFlipper(mesh) && viewerMode === 'play') {
			if (mesh.visible !== false) stats.cabFlipperHidden++
			mesh.visible = false
			return
		}
		if (!mesh.isMesh) {
			if (
				n &&
				(RE_CAB.test(n) || RE_VR.test(n) || resolveButtonCode(n)) &&
				(o as THREE.Object3D).visible === false
			) {
				;(o as THREE.Object3D).visible = true
				stats.cabForced++
			}
			return
		}
		const matForClassify = mesh.material as THREE.Material | THREE.Material[] | undefined
		const firstMat = Array.isArray(matForClassify)
			? (matForClassify[0] as THREE.MeshStandardMaterial | undefined)
			: (matForClassify as THREE.MeshStandardMaterial | undefined)
		const matName = (firstMat?.name ?? '').toLowerCase()
		const mapName = ((firstMat?.map as THREE.Texture | undefined)?.name ?? '').toLowerCase()
		const c = classify(
			n,
			matName,
			mapName,
			!!(firstMat?.userData as unknown as Record<string, unknown>)?.__isBaked,
			!!(firstMat?.userData as unknown as Record<string, unknown>)?.__addBlend,
		)
		if (c.isGlass) {
			hideMesh(mesh, 'glass', stats)
			return
		}
		if (c.isLm || (c.isVlmBake && !c.isMainBake)) {
			stats.lightmaps++
			if (n.includes('bumper')) stats.bumperLM++
		}
		if (n.includes('playfield') && !n.includes('underwall') && !n.includes('wall') && mesh.visible === false) {
			mesh.visible = true
			makeParentsVisible(mesh, node, stats)
		}
		if (c.isCab && !mesh.visible) {
			mesh.visible = true
			stats.cabForced++
			makeParentsVisible(mesh, node, stats)
		}
		const buttonCode = resolveButtonCode(n)
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
			;(mesh.userData as unknown as Record<string, unknown>).isCabinetButton = true
			;(mesh.userData as unknown as Record<string, unknown>).buttonCode = buttonCode
			makeParentsVisible(mesh, node, stats)
		}
		if (!mesh.visible && !n.includes('underwall') && !n.includes('wall')) {
			const matsForGen = (
				mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : []
			) as THREE.MeshStandardMaterial[]
			const hasMap = matsForGen.some(mm => !!(mm?.map as unknown) || !!pendingOf(mm))
			const isWhite =
				matsForGen.length > 0 &&
				matsForGen.every(
					mm =>
						((mm?.color as unknown as THREE.Color)?.getHexString?.()?.toLowerCase() === 'ffffff' ||
							(mm?.color as unknown as THREE.Color)?.getHex?.() === 0xffffff) &&
						!mm?.map &&
						!pendingOf(mm),
				)
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
			mats.some(mm => {
				const mn = (mm?.name ?? '').toLowerCase()
				const col = (mm?.color as unknown as THREE.Color)?.getHexString?.()?.toLowerCase()
				return mn.includes('green') || col === '00ff00'
			})
		) {
			hideMesh(mesh, 'greenHidden', stats)
			return
		}
		for (let i = 0; i < mats.length; i++) {
			let mat = mats[i] as THREE.MeshStandardMaterial
			let didFork = false
			const ensureFork = (): THREE.MeshStandardMaterial => {
				if (didFork) return mat
				mat = forkMaterial(mesh, i, mat)
				didFork = true
				return mat
			}
			const mName = (mat.name ?? '').toLowerCase()
			const mp = ((mat.map as THREE.Texture | undefined)?.name ?? '').toLowerCase()
			const mc = classify(
				n,
				mName,
				mp,
				!!(mat.userData as unknown as Record<string, unknown>)?.__isBaked,
				!!(mat.userData as unknown as Record<string, unknown>)?.__addBlend,
			)
			if (n.includes('flipper')) {
				if (mc.isBakedMat && !mat.map) {
					const m = ensureFork()
					;(m.color as THREE.Color).set(0xffffff)
					m.emissive = new THREE.Color(0x444444) as unknown as THREE.Color
					m.emissiveIntensity = BAKED_EMISSIVE
					m.roughness = 0.45
					m.metalness = 0
					m.side = THREE.DoubleSide
					m.needsUpdate = true
				}
				if (mat.map && (mat.map as THREE.Texture).colorSpace !== THREE.SRGBColorSpace) {
					;(mat.map as THREE.Texture).colorSpace = THREE.SRGBColorSpace
					;(mat.map as THREE.Texture).needsUpdate = true
				}
				mesh.castShadow = false
				mesh.receiveShadow = false
				continue
			}
			if (c.isVr || c.isCab) {
				const v = getVr(mat, n)
				if (v !== mat) {
					if (Array.isArray(mesh.material)) (mesh.material as THREE.Material[])[i] = v
					else mesh.material = v
					mat = v
				}
				mesh.castShadow = false
				mesh.receiveShadow = false
				mesh.frustumCulled = true
				mesh.geometry?.computeBoundingSphere?.()
				mesh.geometry?.computeBoundingBox?.()
				stats.vlmFixed++
				continue
			}
			if (mc.isBakedMat || c.isVlmBake) {
				const v = getBaked(mat, n)
				if (v !== mat) {
					if (Array.isArray(mesh.material)) (mesh.material as THREE.Material[])[i] = v
					else mesh.material = v
					mat = v
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
				((mat.userData as unknown as Record<string, unknown>)?.pendingNormalMap as string) ||
				((mat.userData as unknown as Record<string, unknown>)?.pendingEnvMap as string) ||
				((mat.userData as unknown as Record<string, unknown>)?.pendingEmissiveMap as string)
			const isInsertPending = (() => {
				const p = String(pendingGeneric).toLowerCase()
				const isRoundInsert = p.includes('round') && !p.includes('ground')
				return (
					p.includes('insert') ||
					p.includes('rect') ||
					isRoundInsert ||
					p.includes('dot') ||
					p.includes('triangle') ||
					p.includes('flasher') ||
					p.includes('vrlight')
				)
			})()
			if (pendingGeneric && !mat.map && !mat.emissiveMap && isInsertPending) {
				const m = ensureFork()
				m.transparent = true
				m.opacity = 0
				m.depthWrite = false
				m.alphaTest = 0
				m.blending = THREE.NormalBlending
				if (m.emissive) (m.emissive as THREE.Color).set(0x000000)
				m.emissiveIntensity = 0
				m.needsUpdate = true
				continue
			}
			if ((mat.metalness > 0.3 || mat.roughness < 0.4) && !mat.name.toLowerCase().includes('ball')) {
				const m = ensureFork()
				m.roughness = Math.max(m.roughness, 0.75)
				m.metalness = Math.min(m.metalness, 0.1)
				m.needsUpdate = true
				stats.metalFixed++
			}
			if (n.includes('plastic') && !mat.map && !pendingOf(mat)) {
				const m = ensureFork()
				m.side = THREE.DoubleSide
				m.transparent = false
				m.depthWrite = true
				m.alphaTest = 0
				m.opacity = 1
				m.roughness = Math.max((m.roughness ?? 0.6) as number, 0.6)
				m.metalness = Math.min((m.metalness ?? 0) as number, 0.05)
				m.needsUpdate = true
			}
			if (mat.map && (mat.map as THREE.Texture).colorSpace !== THREE.SRGBColorSpace) {
				;(mat.map as THREE.Texture).colorSpace = THREE.SRGBColorSpace
				;(mat.map as THREE.Texture).needsUpdate = true
			}
		}
		mesh.receiveShadow = false
		if (c.isVr || c.isCab) {
			mesh.frustumCulled = true
			mesh.geometry?.computeBoundingSphere?.()
			mesh.geometry?.computeBoundingBox?.()
		}
		if (n.includes('plastic') || n.includes('ramp')) {
			const rMats = (
				Array.isArray(mesh.material) ? mesh.material : [mesh.material]
			) as THREE.MeshStandardMaterial[]
			for (let pi = 0; pi < rMats.length; pi++) {
				const base = rMats[pi] as THREE.MeshStandardMaterial
				if (base.side !== THREE.DoubleSide) {
					const m = forkMaterial(mesh, pi, base)
					m.side = THREE.DoubleSide
					m.needsUpdate = true
				}
			}
		}
	})

	let hasBakedPlayfield = false
	node.traverse(o => {
		if ((o as THREE.Mesh).isMesh && (o.name ?? '').toLowerCase().includes('bm_playfield')) hasBakedPlayfield = true
	})
	if (hasBakedPlayfield) {
		node.traverse(o => {
			const mesh = o as THREE.Mesh
			if (!mesh.isMesh) return
			const n = (mesh.name ?? '').toLowerCase()
			const mat = (
				Array.isArray(mesh.material)
					? (mesh.material as THREE.Material[])[0]
					: (mesh.material as THREE.Material | undefined)
			) as THREE.MeshStandardMaterial | undefined
			const matName = (mat?.name ?? '').toLowerCase()
			const mapName = ((mat?.map as THREE.Texture | undefined)?.name ?? '').toLowerCase()
			const pending = mat ? pendingOf(mat) : ''
			const eff = mapName || pending
			const c = classify(
				n,
				matName,
				eff,
				!!(mat?.userData as unknown as Record<string, unknown>)?.__isBaked,
				!!(mat?.userData as unknown as Record<string, unknown>)?.__addBlend,
			)
			const isBase = isBasePlayfield(n, c) || n === 'primitive-playfield_mesh'
			if (isBase && mesh.visible) hideMesh(mesh, 'playfieldHidden', stats)
			if (n.includes('bm_playfield') && mesh.visible === false) {
				mesh.visible = true
				makeParentsVisible(mesh, node, stats)
			}
		})
	}

	let hasBakedDuplicate = false
	node.traverse(o => {
		if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).visible && (o.name ?? '').toLowerCase().includes('bm_'))
			hasBakedDuplicate = true
	})
	if (hasBakedDuplicate) {
		node.traverse(o => {
			const mesh = o as THREE.Mesh
			if (!mesh.isMesh) return
			const nn = (mesh.name ?? '').toLowerCase()
			const isBaked = nn.includes('bm_')
			const isDynamicFlipper = nn.includes('flipper') && !isBaked
			const isBakedFlipper = isBaked && (nn.includes('bat') || nn.includes('flipper'))
			if (viewerMode === 'play' && isBakedFlipper && mesh.visible) mesh.visible = false
			else if (viewerMode !== 'play' && isDynamicFlipper && mesh.visible) mesh.visible = false
		})
	}

	node.traverse(o => {
		const mesh = o as THREE.Mesh
		if (!mesh.isMesh || mesh.visible) return
		const n = (mesh.name ?? '').toLowerCase()
		const isSling = n.includes('sling') || /su[0-9]/i.test(n) || n.includes('_su') || n.includes('su_')
		if (!isSling) return
		const mat = (
			Array.isArray(mesh.material)
				? (mesh.material as THREE.Material[])[0]
				: (mesh.material as THREE.Material | undefined)
		) as THREE.MeshStandardMaterial | undefined
		const c = mat
			? classify(
					n,
					(mat.name ?? '').toLowerCase(),
					((mat.map as THREE.Texture | undefined)?.name ?? '').toLowerCase(),
					!!(mat.userData as unknown as Record<string, unknown>)?.__isBaked,
					!!(mat.userData as unknown as Record<string, unknown>)?.__addBlend,
				)
			: ({ isGlass: false, isLm: false, isVlmBake: false, isMainBake: false } as unknown as ClassifyResult)
		if (c.isGlass || c.isLm || (c.isVlmBake && !c.isMainBake)) return
		if (mat && (mat.name ?? '').toLowerCase().includes('green')) return
		mesh.visible = true
		makeParentsVisible(mesh, node, stats)
	})

	node.traverse(o => {
		const mesh = o as THREE.Mesh
		if (!mesh.isMesh || !mesh.visible) return
		const n = (mesh.name ?? '').toLowerCase()
		const c = classify(
			n,
			((mesh.material as THREE.MeshStandardMaterial | undefined)?.name ?? '').toLowerCase(),
			(
				((mesh.material as THREE.MeshStandardMaterial | undefined)?.map as THREE.Texture | undefined)?.name ??
				''
			).toLowerCase(),
			!!(
				(mesh.material as THREE.MeshStandardMaterial | undefined)?.userData as unknown as Record<
					string,
					unknown
				>
			)?.__isBaked,
			!!(
				(mesh.material as THREE.MeshStandardMaterial | undefined)?.userData as unknown as Record<
					string,
					unknown
				>
			)?.__addBlend,
		)
		if (c.isBakedMat || c.isVr || c.isCab) return
		if (mesh.geometry?.attributes?.position) {
			const pos = mesh.geometry.attributes.position as THREE.BufferAttribute
			let hasNaN = false
			for (let i = 0; i < pos.count * pos.itemSize; i++)
				if (!Number.isFinite((pos.array as unknown as number[])[i])) {
					hasNaN = true
					break
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
	const keepWhite = (name: string): boolean => {
		const n = name.toLowerCase()
		return (
			n.includes('playfield') ||
			n.includes('ball') ||
			n.includes('flipper') ||
			n.includes('bumper') ||
			n.includes('light') ||
			n.includes('dmd') ||
			n.includes('vr_') ||
			n.includes('vrcab') ||
			n.includes('cabinet') ||
			n.includes('lockbar') ||
			n.includes('pincab') ||
			n.includes('ramp') ||
			n.includes('plastic') ||
			n.includes('gate') ||
			n.includes('kicker') ||
			n.includes('target') ||
			n.includes('spinner') ||
			n.includes('button') ||
			n.includes('coin') ||
			n.includes('plunger') ||
			n.includes('primitive-bm') ||
			n.includes('bm_')
		)
	}
	node.traverse(o => {
		const mesh = o as THREE.Mesh
		if (!mesh.isMesh || !mesh.visible) return
		const n = (mesh.name ?? '').toLowerCase()
		if (keepWhite(n)) return
		const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[]
		if (mats.some(m => !!(m?.map as unknown) || !!pendingOf(m))) return
		if (!mats.every(m => (m?.color as unknown as THREE.Color)?.getHexString?.()?.toLowerCase() === 'ffffff')) return
		hideMesh(mesh, null, stats)
		whiteWallsHidden++
	})
	if (whiteWallsHidden) harnessLog?.(`[wall] Hid ${whiteWallsHidden} white untextured stray meshes`, 'info')
	if (stats.nanFixed || stats.nanHidden)
		harnessLog?.(`[sanitize] ${stats.nanFixed} fixed ${stats.nanHidden} hidden`, 'info')

	{
		let darkOccludersHidden = 0
		node.updateMatrixWorld(true)
		const isDarkMat = (mat: THREE.MeshStandardMaterial): boolean => {
			if (!mat || !(mat as unknown as Record<string, unknown>).color) return false
			const hex = (mat.color as THREE.Color).getHex()
			const r = (hex >> 16) & 0xff
			const g = (hex >> 8) & 0xff
			const b = hex & 0xff
			const lum = 0.299 * r + 0.587 * g + 0.114 * b
			const mapName = ((mat.map as THREE.Texture | undefined)?.name ?? '').toLowerCase()
			const pending = pendingOf(mat).toLowerCase()
			const isBlackMap = mapName.includes('black') || pending.includes('black')
			return lum < 36 || isBlackMap
		}
		node.traverse(o => {
			const mesh = o as THREE.Mesh
			if (!mesh.isMesh || !mesh.visible) return
			const n = (mesh.name ?? '').toLowerCase()
			if (
				n.includes('playfield') ||
				n.includes('ball') ||
				n.includes('flipper') ||
				n.includes('bumper') ||
				n.includes('light') ||
				n.includes('dmd') ||
				n.includes('vr_') ||
				n.includes('vrcab') ||
				n.includes('cabinet') ||
				n.includes('lockbar') ||
				n.includes('pincab') ||
				n.includes('ramp') ||
				n.includes('plastic') ||
				n.includes('gate') ||
				n.includes('kicker') ||
				n.includes('target') ||
				n.includes('spinner') ||
				n.includes('button') ||
				n.includes('coin') ||
				n.includes('plunger')
			)
				return
			const mats = (
				Array.isArray(mesh.material) ? mesh.material : [mesh.material]
			) as THREE.MeshStandardMaterial[]
			if (mats.length === 0) return
			if (
				mats.some(
					m =>
						(m.map as THREE.Texture | undefined) &&
						!((m.map as THREE.Texture).name ?? '').toLowerCase().includes('black'),
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

	node.traverse(o => {
		const mesh = o as THREE.Mesh
		if (!mesh.isMesh) return
		if ((mesh.userData as unknown as Record<string, unknown>).isCabinetButton) return
		for (let cur: THREE.Object3D | null = mesh.parent; cur && cur !== node; cur = cur.parent) {
			if (
				(cur.userData as unknown as Record<string, unknown>)?.isCabinetButton &&
				(cur.userData as unknown as Record<string, unknown>).buttonCode
			) {
				;(mesh.userData as unknown as Record<string, unknown>).isCabinetButton = true
				;(mesh.userData as unknown as Record<string, unknown>).buttonCode = (
					cur.userData as unknown as Record<string, unknown>
				).buttonCode
				mesh.frustumCulled = false
				mesh.renderOrder = 100
				break
			}
			const ancCode = resolveButtonCode((cur.name ?? '').toLowerCase())
			if (ancCode) {
				;(mesh.userData as unknown as Record<string, unknown>).isCabinetButton = true
				;(mesh.userData as unknown as Record<string, unknown>).buttonCode = ancCode
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
	const W = Math.max(1600, maxDim * 8)
	const D = Math.max(1600, maxDim * 8)
	const H = Math.max(900, maxDim * 6)
	const group = new THREE.Group()
	group.name = 'vr_procedural_room'
	const floorY = center.z - size.z * 0.6 - 200
	const box = new THREE.Mesh(
		new THREE.BoxGeometry(W, D, H),
		new THREE.MeshStandardMaterial({ color: 0x1c222e, roughness: 0.95, side: THREE.BackSide }),
	)
	box.position.set(center.x, center.y, floorY + H * 0.5)
	group.add(box)
	const floor = new THREE.Mesh(
		new THREE.PlaneGeometry(W * 0.98, D * 0.98),
		new THREE.MeshStandardMaterial({ color: 0x232a3a, roughness: 0.92, side: THREE.DoubleSide }),
	)
	floor.position.set(center.x, center.y, floorY + 0.6)
	group.add(floor)
	const grid = new THREE.GridHelper(Math.min(W, D) * 0.96, 16, 0x2f3a5a, 0x1e2535)
	grid.position.set(center.x, center.y, floorY + 1.2)
	grid.rotation.x = Math.PI / 2
	group.add(grid)
	const hemi = new THREE.HemisphereLight(0xffffff, 0x1a1f2e, 0.45)
	hemi.name = 'proc_hemi'
	group.add(hemi)
	scene.add(group)
	return group
}

type DeferredTexture = {
	getName(): string
	szPath?: string
	width: number
	height: number
	isHdr?: () => boolean
}

export const isDeferred = (tx: DeferredTexture, table: { getPlayfieldMap(): string }): boolean => {
	const n = tx.getName().toLowerCase()
	const pf = table.getPlayfieldMap().toLowerCase()
	if (n === pf) return false
	const p = (tx.szPath ?? '').toLowerCase()
	if (p.endsWith('.exr') || p.endsWith('.hdr') || tx.isHdr?.()) return true
	if (tx.width * tx.height > LARGE_TEXTURE_PIXELS) return true
	if (RE_BAKE_MAP.test(n) || n.includes('playfield')) return false
	return false
}
