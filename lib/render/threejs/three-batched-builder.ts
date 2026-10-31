// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE

import {
	BatchedMesh,
	type BufferGeometry,
	type Group,
	InstancedMesh,
	Matrix4,
	type Mesh,
	type MeshStandardMaterial,
} from 'three'
import { isLowQuality } from '../../util/quality.js'
import type { Table } from '../../vpt/table/table.js'
import { normalizePendingKeys, pendingMapOf } from './material-shared.js'
import { mergeBulbGlowQuads } from './nodes/bulb-glow-node.js'
import { isButtonLike, RE_CAB, RE_VR } from './scene-classify.js'
import type { ThreeRenderApi } from './three-render-api.js'

// Buckets below this vertex count cost more in BatchedMesh bookkeeping than one
// extra draw call saves; low-quality mode batches regardless because draw calls
// dominate fill rate on weak GPUs.
const VERTEX_THRESHOLD = 100

function isVrCabName(n: string): boolean {
	return RE_VR.test(n) || RE_CAB.test(n)
}

function signature(geo: BufferGeometry): string {
	const hasIndex = !!geo.getIndex()
	const hasUv = !!geo.getAttribute('uv')
	const hasNormal = !!geo.getAttribute('normal')
	const hasColor = !!geo.getAttribute('color')
	const hasTangent = !!geo.getAttribute('tangent')
	return `${hasIndex ? 'i' : 'n'}:${hasUv ? 'uv' : 'nou'}:${hasNormal ? 'n' : 'non'}:${hasColor ? 'c' : 'nc'}:${hasTangent ? 't' : 'nt'}`
}

// Batch identity cannot be derived from the material cache getKey: updaters mutate
// live render state (tint/BDL/alpha uniforms, pending maps, depthWrite, side) after
// creation without changing the file-level getKey inputs, so getKey would merge
// materials that diverge at runtime. Every live prop joins this key instead.
function materialKey(mat: MeshStandardMaterial): string {
	const ud = mat.userData as any
	// Node materials (BDL/baked) keep the bound texture in userData, never in
	// the classic .map slot: key its name too, or same-name materials with
	// different images merge into one batch rendering the first map.
	// (Pending maps need no disjunct: canBatch rejects them before this key.)
	const map = (mat.map as any)?.name ?? ud.__mapName ?? 'nomap'
	const pending = pendingMapOf(ud)
	const color = (mat.color as { getHex?: () => number } | undefined)?.getHex?.() ?? ''
	const emissive = (mat.emissive as { getHex?: () => number } | undefined)?.getHex?.() ?? ''
	// Node materials carry live appearance in uniforms (classic color/opacity/
	// emissive are overridden by colorNode/opacityNode/emissiveNode), so the tint
	// + BDL state join the key alongside the classic props. Post-process forks
	// (plastic DoubleSide, flipper white+emissive) preserve base.name, so every
	// live prop must be keyed or same-name materials merge and one renders wrong.
	const tint = (ud.__uAlbedo ?? ud.__uTint)?.value?.getHex?.() ?? ''
	const bdl = ud.__uBDL?.value ?? ''
	const below = ud.__below ?? ''
	const alpha = ud.__uAlpha?.value ?? ''
	return `${mat.name ?? 'noname'}|${map}|${pending}|${mat.transparent ? 't' : 'o'}|${mat.blending ?? 1}|${mat.depthWrite ? 'w' : 'n'}|${mat.polygonOffset ? `${mat.polygonOffsetFactor}/${mat.polygonOffsetUnits}` : '0'}|${ud.__addBlend ? 'a' : 'o'}|${ud.__isBaked ? 'b' : 'o'}|side${mat.side}|c${color}|e${emissive}:${mat.emissiveIntensity ?? ''}|m${mat.metalness ?? ''}:r${mat.roughness ?? ''}|a${mat.alphaTest ?? ''}:o${mat.opacity ?? ''}|u${tint}:${bdl}:${below}:${alpha}`
}

// Single batch gate: transparent/additive materials need their own draws, pending
// textures would bake a placeholder into the batch, and fork-cloned materials
// carry per-mesh state that must not merge.
export function canBatch(mat: MeshStandardMaterial): boolean {
	if (!mat) return false
	if ((mat.userData as any)?.__addBlend) return false
	if (mat.transparent) return false
	const ud = mat.userData as any
	if (!ud) return true
	normalizePendingKeys(ud)
	if (pendingMapOf(ud) || ud.pendingNormalMap || ud.pendingEnvMap || ud.pendingEmissiveMap) return false
	if (ud.__primitiveCloned) return false
	return true
}

function isEffectiveVisible(o: any, root: Group): boolean {
	if (!o.visible) return false
	for (let p = o.parent; p && p !== root; p = p.parent) if (!p.visible) return false
	return true
}

function isUnder(o: any, root: Group, match: (name: string) => boolean, includeSelf = false): boolean {
	for (let p = includeSelf ? o : o.parent; p && p !== root; p = p.parent) {
		if (match((p.name || '').toLowerCase())) return true
	}
	return false
}

function isInLightBulbs(o: any, root: Group): boolean {
	return isUnder(o, root, name => name === 'lightbulbs')
}

function isInVrCab(o: any, root: Group): boolean {
	return isUnder(o, root, isVrCabName, true)
}

// Balls (group, mesh, or material) never batch: dynamic and few.
function isBallLike(o: any, root: Group, mat: MeshStandardMaterial): boolean {
	const n = (o.name || '').toLowerCase()
	return (
		isUnder(o, root, name => name.startsWith('ball'), true) ||
		n.includes('ball') ||
		!!(mat.name && mat.name.toLowerCase().includes('ball'))
	)
}

// Procedural DMD quads stream their texture per frame and must stay live.
function isDmdLike(o: any, dmdNames: Set<string>): boolean {
	const n = (o.name || '').toLowerCase()
	return !!o.userData?.isProceduralDMD || o.name.startsWith('DMD_') || n.includes('dmd') || dmdNames.has(n)
}

export function batchStaticOpaques(root: Group, table: Table, _renderApi: ThreeRenderApi): number {
	root.updateMatrixWorld(true)
	const invRoot = new Matrix4().copy(root.matrixWorld).invert()
	const movables = new Set(table.getMovables().map(a => a.getName()))
	const primitives = new Set(Object.values(table.primitives).map(p => p.getName()))
	const rubbers = new Set(Object.values(table.rubbers).map(r => r.getName()))
	const animatables = new Set(table.getAnimatables().map(a => a.getName()))
	const dynamicPrimitives = (() => {
		const s = new Set<string>()
		for (const p of Object.values(table.primitives))
			if ((p as any).data?.mesh?.animationFrames?.length || (p as any).data?.staticRendering === false)
				s.add(p.getName().toLowerCase())
		for (const name of animatables) if (primitives.has(name)) s.add(name.toLowerCase())
		return s
	})()
	const low = isLowQuality()
	const isAnimated = (o: any): boolean => {
		const isMovableOrAnim = (name: string): boolean =>
			!!name && (movables.has(name) || (animatables.has(name) && !primitives.has(name)))
		if (isMovableOrAnim(o.name)) return true
		for (let p = o.parent; p && p !== root; p = p.parent) {
			if (isMovableOrAnim(p.name)) return true
			if (rubbers.has(p.name)) return true
			if (primitives.has(p.name)) {
				if (dynamicPrimitives.has(p.name.toLowerCase())) return true
				return false
			}
		}
		return false
	}

	const dmdNames = new Set<string>()
	for (const group of [(table as any).flashers, (table as any).textboxes]) {
		for (const k in group) {
			const item = group[k]
			if (item?.data?.isDMD) dmdNames.add(item.getName().toLowerCase())
		}
	}

	const buckets = new Map<string, { material: MeshStandardMaterial; meshes: Mesh[] }>()
	root.traverse((o: any) => {
		if (!o.isMesh || !o.geometry || !o.material) return
		if ((o as any).isBatchedMesh || (o as any).isInstancedMesh) return
		if (Array.isArray(o.material)) return
		if (!isEffectiveVisible(o, root)) return
		if (isInLightBulbs(o, root)) return
		if (isInVrCab(o, root)) return
		const mat = o.material as MeshStandardMaterial
		if (isBallLike(o, root, mat)) return
		if (!canBatch(mat)) return
		if (isAnimated(o)) return
		if (isDmdLike(o, dmdNames)) return
		if (isButtonLike(o.name, o.userData)) return
		const geo = o.geometry as BufferGeometry
		if (!geo.getAttribute('position')) return
		const key = `${materialKey(mat)}:${signature(geo)}:${o.renderOrder ?? 0}:${o.castShadow ? 1 : 0}:${o.receiveShadow ? 1 : 0}`
		let bucket = buckets.get(key)
		if (!bucket) {
			bucket = { material: mat, meshes: [] }
			buckets.set(key, bucket)
		}
		bucket.meshes.push(o as Mesh)
	})

	let count = 0
	for (const { material, meshes } of buckets.values()) {
		if (meshes.length < 2) continue
		let totalVerts = 0
		let totalIndices = 0
		let hasIndex = false
		for (const m of meshes) {
			const g = m.geometry as BufferGeometry
			totalVerts += g.getAttribute('position').count
			const idx = g.getIndex()
			if (idx) {
				totalIndices += idx.count
				hasIndex = true
			}
		}
		if (totalVerts < VERTEX_THRESHOLD && !low) continue
		// Instance only identical geometry references: counts-only identity aliased
		// same-tessellation different-shape meshes (mirrored slings/posts) into
		// copies of meshes[0]. Anything else takes the BatchedMesh path below,
		// which keeps each mesh's own geometry.
		const uniqueGeos = new Set(meshes.map(m => m.geometry))
		if (uniqueGeos.size === 1 && meshes.length >= 3) {
			const baseGeo = meshes[0].geometry as BufferGeometry
			const instanced = new InstancedMesh(baseGeo, material, meshes.length)
			instanced.name = `instanced:generic:${material.name || 'opaque'}:${meshes.length}`
			instanced.frustumCulled = true
			const locals: Matrix4[] = []
			for (let i = 0; i < meshes.length; i++) {
				const mesh = meshes[i]
				mesh.updateMatrixWorld(true)
				const local = new Matrix4().multiplyMatrices(invRoot, mesh.matrixWorld)
				locals.push(local)
				instanced.setMatrixAt(i, local)
			}
			instanced.instanceMatrix.needsUpdate = true
			instanced.computeBoundingBox()
			instanced.computeBoundingSphere()
			;(instanced.geometry as any).computeBoundsTree?.({ includeInstances: true } as any)
			root.add(instanced)
			for (let i = 0; i < meshes.length; i++) {
				const mesh = meshes[i] as unknown as { visible: boolean; userData: Record<string, unknown> }
				mesh.visible = false
				// The pre-batch matrix is saved so applyVisibility can restore the
				// instance after a zero-scale hide (InstancedMesh has no per-instance
				// visibility flag; without this the hide is one-way).
				mesh.userData.__batched = {
					batched: instanced,
					instanceId: i,
					isInstanced: true,
					matrix: locals[i]!.clone(),
				}
			}
			count++
			continue
		}
		const batched = new BatchedMesh(meshes.length, totalVerts, hasIndex ? totalIndices : totalVerts * 3, material)
		batched.name = `batched:${material.name || 'opaque'}:${meshes.length}`
		batched.perObjectFrustumCulled = true
		batched.frustumCulled = true
		for (const mesh of meshes) {
			mesh.updateMatrixWorld(true)
			const geoId = batched.addGeometry(mesh.geometry as BufferGeometry)
			const instanceId = batched.addInstance(geoId)
			const local = new Matrix4().multiplyMatrices(invRoot, mesh.matrixWorld)
			batched.setMatrixAt(instanceId, local)
		}
		batched.computeBoundingBox()
		batched.computeBoundingSphere()
		;(batched.geometry as any).computeBoundsTree?.({ includeInstances: true } as any)
		root.add(batched)
		for (let i = 0; i < meshes.length; i++) {
			const mesh = meshes[i] as unknown as { visible: boolean; userData: Record<string, unknown> }
			mesh.visible = false
			mesh.userData.__batched = { batched, instanceId: i }
		}
		count++
	}
	return count
}

export function instancedBulbs(root: Group, table: Table, _renderApi: ThreeRenderApi): number {
	// Bulb halos merge into one composite; hulls stay uninstanced.
	return mergeBulbGlowQuads(root, table)
}

/**
 * Draw-call reduction: fold static opaque meshes into BatchedMesh buckets (bulb
 * halos merge — see instancedBulbs). Runs after postProcessScene
 * (hidden meshes are skipped) and ideally after textures arrive (meshes with
 * pending textures are skipped — safe to retry). Dynamic apply* calls unbatch
 * their mesh first.
 */
export function optimizeScene(
	root: Group,
	table: Table,
	renderApi: ThreeRenderApi,
	opts: { batched?: boolean; instanced?: boolean } = {},
): { batched: number; instanced: number } {
	const instanced = (opts.instanced ?? true) ? instancedBulbs(root, table, renderApi) : 0
	const batched = (opts.batched ?? true) ? batchStaticOpaques(root, table, renderApi) : 0
	return { batched, instanced }
}
