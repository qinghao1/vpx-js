import * as THREE from 'three'
import { isLowQuality } from '../../util/quality.js'
import { BAKED_EMISSIVE, createBakedMaterialResolver, createVrMaterialResolver } from './baked-materials.js'
import { resolveButtonCode } from './cabinet-buttons.js'
import { cloneMaterialForWrite } from './material-shared.js'
import { getSlots } from './material-slots.js'
import { isPrimitiveNodeMaterial } from './nodes/primitive-bdl-node.js'
import {
	type CustomMaterialUserData,
	classify,
	isBakedPlayfield,
	pendingOf,
	RE_CAB,
	RE_NON_OPAQUE,
	RE_RAMP_FAMILY,
	RE_VR,
} from './scene-classify.js'
import { applyUnderfloorOcclusionPass } from './underfloor-occlusion.js'
import {
	applyButtonInheritPass,
	applyDarkOccluderPass,
	applyFlipperVisibilityPass,
	applyPlayfieldPass,
	applySlingVisibilityPass,
	applyWhiteWallPass,
	collectPostProcessNodes,
	finishStatic,
	firstMaterial,
	hasBakedPlayfield,
	hasVisibleBakedDuplicate,
	hideMesh,
	isInCabFlipper,
	makeParentsVisible,
	meshMaterials,
	sanitizeNaN,
} from './visibility-heuristics.js'

// Backward-compatible re-exports: this module's public surface is unchanged;
// implementations now live in focused modules.
export {
	applyBakedMaterial,
	BAKED_EMISSIVE,
	BAKED_METAL,
	BAKED_ROUGH,
	wrapBakedTex,
} from './baked-materials.js'
export { BUTTON_CODE_PATTERNS, resolveButtonCode } from './cabinet-buttons.js'
export { type DeferredTexture, isDeferred } from './deferred-texture.js'
export { ensureProceduralRoom } from './procedural-room.js'
export {
	type ClassifyResult,
	classify,
	isBakedMesh,
	isBakedMeshByNames,
	isBakedPlayfield,
	isBasePlayfield,
} from './scene-classify.js'
export { swipeNudge } from './swipe-nudge.js'
export { hideCabFlippers, showCabFlippers } from './visibility-heuristics.js'

type PostProcessOptions = {
	viewerMode?: 'viewer' | 'play'
	harnessLog?: (msg: string, level?: string) => void
}

function ensureSrgb(map: THREE.Texture | null | undefined): void {
	if (map && map.colorSpace !== THREE.SRGBColorSpace) {
		map.colorSpace = THREE.SRGBColorSpace
		map.needsUpdate = true
	}
}

// The pinball itself (VPX material exactly `ball`, generated as
// `material:ball`) keeps its authored metalness; anything merely containing
// the substring (fireball, balloon, ...) flattens like the rest.
function isBallMaterial(matName: string | undefined): boolean {
	const n = (matName ?? '').toLowerCase()
	return n === 'ball' || n === 'material:ball'
}

// Insert/flasher textures stream in after generation; while pending, the mesh
// hides (transparent black) instead of flashing its untextured fallback color.
function isInsertPendingName(pending: unknown): boolean {
	const pendingLower = String(pending).toLowerCase()
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
}

/**
 * Fixup pass over a generated table node: baked-lightmap material swaps,
 * VR/cabinet visibility, glass/green-ramp/white-wall hiding, NaN sanitation.
 * Runs after generation (it classifies finished meshes by name/material) and
 * before batching (hidden meshes must not be batched). Returns per-pass stats.
 *
 * PMVM deviation (documented, not gated): upstream hides VR-room/cabinet
 * groups outside VR mode via PartGroupData::PlayerModeVisibilityMask
 * (PartGroup.h; Renderer.cpp picks PMVM_VIRTUAL_REALITY/CABINET/FSS/DESKTOP
 * per player mode). This viewer always forces those meshes visible here and
 * always builds a procedural room in ensureProceduralRoom so flat-screen
 * tables look complete. Threading the real player mode through is a follow-up.
 */
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
		cabFlipperHidden: 0,
		greenHidden: 0,
		playfieldHidden: 0,
	}
	// Fuse the historical ~10 full tree walks: collect once, run every pass over the array.
	const nodes = collectPostProcessNodes(node)
	sanitizeNaN(nodes, stats)
	const getBaked = createBakedMaterialResolver()
	const getVr = createVrMaterialResolver()

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

	const runMainPass = (child: THREE.Object3D): void => {
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
				child.visible === false
			) {
				child.visible = true
				stats.cabForced++
			}
			return
		}
		const firstMat = firstMaterial(mesh)
		const firstUserData = getSlots(firstMat)
		const matName = (firstMat?.name ?? '').toLowerCase()
		const mapName =
			((firstMat?.map as THREE.Texture | undefined)?.name ?? '').toLowerCase() ||
			String(firstUserData.__mapName ?? '').toLowerCase() ||
			(firstMat ? pendingOf(firstMat) : '')
		const info = classify(nameLower, matName, mapName, !!firstUserData.__isBaked, !!firstUserData.__addBlend)
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
		if (buttonCode) {
			if (!mesh.visible) {
				mesh.visible = true
				stats.cabForced++
				makeParentsVisible(mesh, node, stats)
			}
			mesh.frustumCulled = false
			mesh.geometry?.computeBoundingSphere?.()
			mesh.geometry?.computeBoundingBox?.()
			const matsBtn = meshMaterials(mesh)
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
			const matsForGen = meshMaterials(mesh)
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
		const mats = meshMaterials(mesh)
		if (
			mats.some(material => {
				const mn = (material?.name ?? '').toLowerCase()
				const col = (material?.color as unknown as THREE.Color)?.getHexString?.()?.toLowerCase()
				// Textured green (ramp art, playfield details) is authored
				// content: only untextured flat-green offender meshes hide here.
				if (material?.map || pendingOf(material)) return false
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
					flipperMat.color.set(0xffffff)
					flipperMat.emissive = new THREE.Color(0x444444)
					flipperMat.emissiveIntensity = BAKED_EMISSIVE
					flipperMat.roughness = 0.45
					flipperMat.metalness = 0
					flipperMat.side = THREE.DoubleSide
					flipperMat.needsUpdate = true
				}
				ensureSrgb(mat.map)
				finishStatic(mesh, undefined, false)
				continue
			}
			if (info.isVr || info.isCab) {
				if (isPrimitiveNodeMaterial(mat) && !info.isLm && !info.isVlmBake) {
					finishStatic(mesh, stats)
					continue
				}
				if (!info.isLm && !info.isVlmBake) {
					const vrMat = getVr(mat, nameLower)
					if (vrMat !== mat) {
						if (Array.isArray(mesh.material)) (mesh.material as THREE.Material[])[matIdx] = vrMat
						else mesh.material = vrMat
						mat = vrMat
					}
					finishStatic(mesh, stats)
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
					isBakedPlayfield(nameLower, matInfo) &&
					!RE_NON_OPAQUE.test(nameLower) &&
					!RE_RAMP_FAMILY.test(nameLower)
				) {
					mesh.renderOrder = -1
				}
				finishStatic(mesh, stats)
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
			const isInsertPending = isInsertPendingName(pendingGeneric)
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
			if ((mat.metalness > 0.3 || mat.roughness < 0.4) && !isBallMaterial(mat.name)) {
				const metalMat = ensureFork()
				metalMat.roughness = Math.max(metalMat.roughness, 0.75)
				metalMat.metalness = Math.min(metalMat.metalness, 0.1)
				metalMat.needsUpdate = true
				stats.metalFixed++
			}
			ensureSrgb(mat.map)
		}
		mesh.receiveShadow = false
		if (info.isVr || info.isCab) {
			mesh.frustumCulled = true
			mesh.geometry?.computeBoundingSphere?.()
			mesh.geometry?.computeBoundingBox?.()
		}
		// Single plastic/ramp surface pass: untextured plastic goes opaque
		// first, then every plastic/ramp surface ensures DoubleSide.
		if (nameLower.includes('plastic') || nameLower.includes('ramp')) {
			const surfaceMats = (
				Array.isArray(mesh.material) ? mesh.material : [mesh.material]
			) as THREE.MeshStandardMaterial[]
			for (let surfaceIdx = 0; surfaceIdx < surfaceMats.length; surfaceIdx++) {
				let surfaceMat = surfaceMats[surfaceIdx] as THREE.MeshStandardMaterial
				if (nameLower.includes('plastic') && !surfaceMat.map && !pendingOf(surfaceMat)) {
					surfaceMat = forkMaterial(mesh, surfaceIdx, surfaceMat)
					surfaceMat.side = THREE.DoubleSide
					surfaceMat.transparent = false
					surfaceMat.depthWrite = true
					surfaceMat.alphaTest = 0
					surfaceMat.opacity = 1
					surfaceMat.roughness = Math.max((surfaceMat.roughness ?? 0.6) as number, 0.6)
					surfaceMat.metalness = Math.min((surfaceMat.metalness ?? 0) as number, 0.05)
					surfaceMat.needsUpdate = true
				}
				if (surfaceMat.side !== THREE.DoubleSide) {
					surfaceMat = forkMaterial(mesh, surfaceIdx, surfaceMat)
					surfaceMat.side = THREE.DoubleSide
					surfaceMat.needsUpdate = true
				}
			}
		}
	}
	for (const child of nodes) runMainPass(child)

	if (hasBakedPlayfield(nodes)) {
		applyPlayfieldPass(nodes, node, stats)
		// The baked playfield replaces the extruded slab as the floor: it must
		// occlude from below or lights/inserts/DMD leak through from underneath.
		const underfloorFixed = applyUnderfloorOcclusionPass(nodes, stats)
		if (underfloorFixed) harnessLog?.(`[floor] ${underfloorFixed} baked playfield(s) double-sided`, 'info')
	}

	if (hasVisibleBakedDuplicate(nodes)) {
		applyFlipperVisibilityPass(nodes, viewerMode)
	}

	applySlingVisibilityPass(nodes, node, stats)

	if (stats.vrKept) harnessLog?.(`[VR] Kept ${stats.vrKept} VR meshes`, 'info')
	if (stats.cabForced) harnessLog?.(`[cabinet] ${stats.cabForced} cab`, 'info')
	if (stats.cabFlipperHidden) harnessLog?.(`[cabinet] Hid ${stats.cabFlipperHidden} VRCab flipper(s) in play`, 'info')
	if (stats.vlmFixed) harnessLog?.(`[VLM] ${stats.vlmFixed} baked`, 'info')
	if (stats.metalFixed) harnessLog?.(`[mat] ${stats.metalFixed} metals`, 'info')
	if (stats.playfieldHidden)
		harnessLog?.(`[playfield] Hid ${stats.playfieldHidden} base playfield (baked replaced)`, 'info')
	if (stats.greenHidden) harnessLog?.(`[ramp] Hid ${stats.greenHidden} green ramp(s)`, 'info')
	if (stats.glass) harnessLog?.(`[glass] Hid ${stats.glass}`, 'info')

	const whiteWallsHidden = applyWhiteWallPass(nodes, stats)
	if (whiteWallsHidden) harnessLog?.(`[wall] Hid ${whiteWallsHidden} white untextured stray meshes`, 'info')
	if (stats.nanFixed) harnessLog?.(`[sanitize] ${stats.nanFixed} fixed`, 'info')

	const darkOccludersHidden = applyDarkOccluderPass(node, nodes, stats)
	if (darkOccludersHidden) harnessLog?.(`[wall] Hid ${darkOccludersHidden} dark large occluders`, 'info')

	applyButtonInheritPass(nodes, node)
	return stats
}
