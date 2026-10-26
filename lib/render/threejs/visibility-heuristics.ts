import * as THREE from 'three'
import { resolveButtonCode } from './cabinet-buttons.js'
import { isBulbGlowMaterial } from './nodes/bulb-glow-node.js'
import {
	type CustomMaterialUserData,
	classify,
	isBakedPlayfield,
	isBasePlayfield,
	pendingOf,
	RE_NON_OPAQUE,
	RE_RAMP_FAMILY,
} from './scene-classify.js'

export const RE_KEEP_DARK =
	/playfield|ball|flipper|bumper|light|dmd|vr_|vrcab|cabinet|lockbar|pincab|ramp|plastic|gate|kicker|target|spinner|button|coin|plunger/i
// The white-wall pass additionally keeps baked (`bm_`) meshes; the dark-occluder pass does not.
export const RE_KEEP_WHITE = new RegExp(`${RE_KEEP_DARK.source}|bm_`, 'i')

export function isInCabFlipper(obj: THREE.Object3D): boolean {
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

export function makeParentsVisible(mesh: THREE.Object3D, root: THREE.Object3D, stats: Record<string, number>): void {
	for (let parent: THREE.Object3D | null = mesh.parent; parent && parent !== root; parent = parent.parent) {
		if (parent.visible === false && !isInCabFlipper(parent)) {
			parent.visible = true
			stats.cabForced++
		}
	}
}

export function hideMesh(obj: THREE.Object3D, statsKey: string | null, stats: Record<string, number>): void {
	if (!obj.visible) return
	obj.visible = false
	if (statsKey) stats[statsKey]++
}

/** First material of a mesh, unwrapping material arrays (undefined when unassigned). */
export function firstMaterial(mesh: THREE.Mesh): THREE.MeshStandardMaterial | undefined {
	const material = mesh.material as THREE.Material | THREE.Material[] | undefined
	return (Array.isArray(material) ? material[0] : material) as THREE.MeshStandardMaterial | undefined
}

/** All materials of a mesh (empty when unassigned). */
export function meshMaterials(mesh: THREE.Mesh): THREE.MeshStandardMaterial[] {
	if (!mesh.material) return []
	return (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[]
}

/**
 * Single pre-order collection of a subtree. All postprocess passes iterate this
 * array instead of re-walking the tree, fusing ~10 O(subtree) traverses into one.
 * Order matches THREE.Object3D.traverse (root first, depth-first pre-order).
 */
export function collectPostProcessNodes(root: THREE.Object3D): THREE.Object3D[] {
	const nodes: THREE.Object3D[] = []
	root.traverse(child => {
		nodes.push(child)
	})
	return nodes
}

export function sanitizeNaN(nodes: THREE.Object3D[], stats: Record<string, number>): void {
	for (const child of nodes) {
		const mesh = child as THREE.Mesh
		const pos = mesh.geometry?.attributes?.position as THREE.BufferAttribute | undefined
		if (!mesh.isMesh || !pos?.array) continue
		const array = pos.array as unknown as number[]
		let bad = false
		for (let i = 0; i < array.length; i++) {
			if (!Number.isFinite(array[i])) {
				array[i] = 0
				bad = true
			}
		}
		if (!bad) continue
		pos.needsUpdate = true
		mesh.geometry.computeBoundingSphere()
		mesh.geometry.computeBoundingBox()
		stats.nanFixed++
	}
}

export function hasBakedPlayfield(nodes: THREE.Object3D[]): boolean {
	for (const child of nodes) {
		const mesh = child as THREE.Mesh
		if (!mesh.isMesh) continue
		const mat = firstMaterial(mesh)
		const matUserData = mat?.userData as CustomMaterialUserData | undefined
		const info = classify(
			(child.name ?? '').toLowerCase(),
			(mat?.name ?? '').toLowerCase(),
			((mat?.map as THREE.Texture | undefined)?.name ?? '').toLowerCase() || (mat ? pendingOf(mat) : ''),
			!!matUserData?.__isBaked,
			!!matUserData?.__addBlend,
		)
		if (isBakedPlayfield(child.name ?? '', info)) return true
	}
	return false
}

export function applyPlayfieldPass(nodes: THREE.Object3D[], root: THREE.Object3D, stats: Record<string, number>): void {
	for (const child of nodes) {
		const mesh = child as THREE.Mesh
		if (!mesh.isMesh) continue
		const meshName = (mesh.name ?? '').toLowerCase()
		const mat = firstMaterial(mesh)
		const matUserData = mat?.userData as CustomMaterialUserData | undefined
		const matName = (mat?.name ?? '').toLowerCase()
		const mapName = ((mat?.map as THREE.Texture | undefined)?.name ?? '').toLowerCase()
		const pending = mat ? pendingOf(mat) : ''
		const effectiveMap = mapName || pending
		const info = classify(meshName, matName, effectiveMap, !!matUserData?.__isBaked, !!matUserData?.__addBlend)
		const isBase = isBasePlayfield(meshName, info)
		if (isBase && mesh.visible) hideMesh(mesh, 'playfieldHidden', stats)
		const bakedPlayfield = isBakedPlayfield(meshName, info)
		if (bakedPlayfield && mesh.visible === false) {
			mesh.visible = true
			makeParentsVisible(mesh, root, stats)
		}
		if (bakedPlayfield && !RE_NON_OPAQUE.test(meshName) && !RE_RAMP_FAMILY.test(meshName)) {
			mesh.renderOrder = -1
		}
	}
}

export function hasVisibleBakedDuplicate(nodes: THREE.Object3D[]): boolean {
	for (const child of nodes) {
		if (
			(child as THREE.Mesh).isMesh &&
			(child as THREE.Mesh).visible &&
			(child.name ?? '').toLowerCase().includes('bm_')
		)
			return true
	}
	return false
}

export function applyFlipperVisibilityPass(nodes: THREE.Object3D[], viewerMode: string): void {
	for (const child of nodes) {
		const mesh = child as THREE.Mesh
		if (!mesh.isMesh) continue
		const nameLower = (mesh.name ?? '').toLowerCase()
		const isBaked = nameLower.includes('bm_')
		const isDynamicFlipper = nameLower.includes('flipper') && !isBaked
		const isBakedFlipper = isBaked && (nameLower.includes('bat') || nameLower.includes('flipper'))
		if (viewerMode === 'play' && isBakedFlipper && mesh.visible) mesh.visible = false
		else if (viewerMode !== 'play' && isDynamicFlipper && mesh.visible) mesh.visible = false
	}
}

export function applySlingVisibilityPass(
	nodes: THREE.Object3D[],
	root: THREE.Object3D,
	stats: Record<string, number>,
): void {
	for (const child of nodes) {
		const mesh = child as THREE.Mesh
		if (!mesh.isMesh || mesh.visible) continue
		const meshName = (mesh.name ?? '').toLowerCase()
		const isSling =
			meshName.includes('sling') ||
			/su[0-9]/.test(meshName) ||
			meshName.includes('_su') ||
			meshName.includes('su_')
		if (!isSling) continue
		const mat = firstMaterial(mesh)
		const matUserData = mat?.userData as CustomMaterialUserData | undefined
		const info = mat
			? classify(
					meshName,
					(mat.name ?? '').toLowerCase(),
					((mat.map as THREE.Texture | undefined)?.name ?? '').toLowerCase(),
					!!matUserData?.__isBaked,
					!!matUserData?.__addBlend,
				)
			: null
		if (info && (info.isGlass || info.isLm || (info.isVlmBake && !info.isMainBake))) continue
		if (mat && (mat.name ?? '').toLowerCase().includes('green')) continue
		mesh.visible = true
		makeParentsVisible(mesh, root, stats)
	}
}

export function applyWhiteWallPass(nodes: THREE.Object3D[], stats: Record<string, number>): number {
	let whiteWallsHidden = 0
	for (const child of nodes) {
		const mesh = child as THREE.Mesh
		if (!mesh.isMesh || !mesh.visible) continue
		const meshName = (mesh.name ?? '').toLowerCase()
		if (RE_KEEP_WHITE.test(meshName)) continue
		const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[]
		// Bulb glow quads are shader-driven light splats (no .map by design);
		// hiding them here would kill all dynamic lamp light with no recovery —
		// the light updater owns their visibility from the live lamp state.
		if (mats.some(material => isBulbGlowMaterial(material))) continue
		if (mats.some(material => !!(material?.map as unknown) || !!pendingOf(material))) continue
		if (
			!mats.every(
				material => (material?.color as unknown as THREE.Color)?.getHexString?.()?.toLowerCase() === 'ffffff',
			)
		)
			continue
		hideMesh(mesh, null, stats)
		whiteWallsHidden++
	}
	return whiteWallsHidden
}

export function applyDarkOccluderPass(
	root: THREE.Object3D,
	nodes: THREE.Object3D[],
	stats: Record<string, number>,
): number {
	let darkOccludersHidden = 0
	root.updateMatrixWorld(true)
	const isDarkMat = (material: THREE.MeshStandardMaterial): boolean => {
		const color = (material as THREE.MeshStandardMaterial | null | undefined)?.color
		if (!color) return false
		const hex = color.getHex()
		const red = (hex >> 16) & 0xff
		const green = (hex >> 8) & 0xff
		const blue = hex & 0xff
		const lum = 0.299 * red + 0.587 * green + 0.114 * blue
		const mapName = ((material.map as THREE.Texture | undefined)?.name ?? '').toLowerCase()
		const pending = pendingOf(material)
		const isBlackMap = mapName.includes('black') || pending.includes('black')
		return lum < 36 || isBlackMap
	}
	for (const child of nodes) {
		const mesh = child as THREE.Mesh
		if (!mesh.isMesh || !mesh.visible) continue
		const meshName = (mesh.name ?? '').toLowerCase()
		if (RE_KEEP_DARK.test(meshName)) continue
		const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[]
		if (mats.length === 0) continue
		if (
			mats.some(
				material =>
					(material.map as THREE.Texture | undefined) &&
					!((material.map as THREE.Texture).name ?? '').toLowerCase().includes('black'),
			)
		)
			continue
		if (!mats.every(isDarkMat)) continue
		const geo = mesh.geometry
		if (!geo?.attributes?.position) continue
		const worldBox = new THREE.Box3().setFromObject(mesh)
		if (worldBox.isEmpty()) continue
		const wsx = worldBox.max.x - worldBox.min.x
		const wsy = worldBox.max.y - worldBox.min.y
		if (wsx < 25 || wsy < 25) continue
		const wsz = worldBox.max.z - worldBox.min.z
		if (wsz < 4) continue
		hideMesh(mesh, null, stats)
		darkOccludersHidden++
	}
	return darkOccludersHidden
}

export function applyButtonInheritPass(nodes: THREE.Object3D[], root: THREE.Object3D): void {
	for (const child of nodes) {
		const mesh = child as THREE.Mesh
		if (!mesh.isMesh) continue
		const meshUserData = mesh.userData as CustomMaterialUserData
		if (meshUserData.isCabinetButton) continue
		for (let cur: THREE.Object3D | null = mesh.parent; cur && cur !== root; cur = cur.parent) {
			const curUserData = cur.userData as CustomMaterialUserData | undefined
			const inheritedCode =
				(curUserData?.isCabinetButton && curUserData.buttonCode) ||
				resolveButtonCode((cur.name ?? '').toLowerCase())
			if (inheritedCode) {
				meshUserData.isCabinetButton = true
				meshUserData.buttonCode = inheritedCode
				mesh.frustumCulled = false
				mesh.renderOrder = 100
				break
			}
		}
	}
}
