// Underfloor occlusion: the baked playfield is the floor occluder.
//
// The generated extruded slab (`playfield_base`) is hidden once a baked
// duplicate exists (applyPlayfieldPass, no z-fighting), and the baked
// replacement is a flat plane that honors the authored `backfacesEnabled`
// flag — single-sided (FrontSide) on tables that bake it that way. From below
// the table that plane is backface-culled and writes no depth, so every
// depth-tested quad above it (insert/lightmap overlays, bulb glow) draws
// straight through the "floor". VR tables additionally ship no procedural
// room, so nothing else occludes from underneath either.
//
// This pass gives the visible baked playfield its underneath faces back:
// DoubleSide + depthWrite on a forked material. Scoped to the baked main
// playfield only (same gate as the renderOrder -1 stamp); aprons, ramps and
// translucent trims are not floor occluders and keep their authored side.
import * as THREE from 'three'
import { cloneMaterialForWrite } from './material-shared.js'
import {
	type CustomMaterialUserData,
	classify,
	isBakedPlayfield,
	pendingOf,
	RE_NON_OPAQUE,
	RE_RAMP_FAMILY,
} from './scene-classify.js'
import { firstMaterial } from './visibility-heuristics.js'

/** Forks the baked playfield surface into a double-sided depth writer. Returns true when a mesh was fixed. */
export function ensureFloorOccluder(mesh: THREE.Mesh): boolean {
	const meshName = (mesh.name ?? '').toLowerCase()
	if (!mesh.isMesh || !mesh.visible) return false
	if (meshName.includes('underwall') || meshName.includes('wall')) return false
	const firstMat = firstMaterial(mesh)
	const matUserData = (firstMat as unknown as { userData?: CustomMaterialUserData } | null)?.userData
	const matName = ((firstMat as unknown as { name?: string } | null)?.name ?? '').toLowerCase()
	const mapName =
		((firstMat as unknown as { map?: { name?: string } } | null)?.map?.name ?? '').toLowerCase() ||
		String(matUserData?.__mapName ?? '').toLowerCase() ||
		(firstMat ? pendingOf(firstMat as unknown as THREE.Material) : '')
	const info = classify(meshName, matName, mapName, !!matUserData?.__isBaked, !!matUserData?.__addBlend)
	if (!isBakedPlayfield(meshName, info)) return false
	if (RE_NON_OPAQUE.test(meshName) || RE_RAMP_FAMILY.test(meshName)) return false
	const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
	let fixed = false
	for (let i = 0; i < mats.length; i++) {
		const mat = mats[i] as THREE.Material | null | undefined
		if (!mat) continue
		if (mat.side === THREE.DoubleSide && mat.depthWrite) continue
		const fork = cloneMaterialForWrite(mat)
		fork.side = THREE.DoubleSide
		fork.depthWrite = true
		fork.needsUpdate = true
		if (Array.isArray(mesh.material)) (mesh.material as THREE.Material[])[i] = fork
		else mesh.material = fork
		fixed = true
	}
	return fixed
}

/** Runs the floor-occluder fix over already-collected post-process nodes. Returns the fixed mesh count. */
export function applyUnderfloorOcclusionPass(nodes: THREE.Object3D[], stats?: Record<string, number>): number {
	let fixed = 0
	for (const child of nodes) {
		if (ensureFloorOccluder(child as THREE.Mesh)) fixed++
	}
	if (stats && fixed > 0) stats.underfloorFixed = (stats.underfloorFixed ?? 0) + fixed
	return fixed
}
