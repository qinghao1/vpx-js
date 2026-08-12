// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE

import {
	BatchedMesh,
	type BufferGeometry,
	type Group,
	InstancedMesh,
	Matrix4,
	type Mesh,
	type MeshStandardMaterial,
} from '../../refs.node.js'
import { loadMesh } from '../../vpt/mesh-loader.js'
import type { Table } from '../../vpt/table/table.js'
import { ThreeMeshGenerator } from './three-mesh-generator.js'
import type { ThreeRenderApi } from './three-render-api.js'

// 200 verts ~66 tris: empirical sweet spot across 20 fixtures + walking_dead
// 0 verts: 16 batches 541 saved 12.9ms build, 200: 10 batches 541 saved 1.9ms, 400: 9 batches 542 saved 1.9ms but loses slingshot tiny batch
const VERTEX_THRESHOLD = 200

function signature(geo: BufferGeometry): string {
	const hasIndex = !!geo.getIndex()
	const hasUv = !!geo.getAttribute('uv')
	const hasNormal = !!geo.getAttribute('normal')
	return `${hasIndex ? 'i' : 'n'}:${hasUv ? 'uv' : 'nou'}:${hasNormal ? 'n' : 'non'}`
}

function canBatch(mat: MeshStandardMaterial): boolean {
	return !!mat && !mat.transparent && !mat.polygonOffset && !(mat.userData as any).__addBlend
}

export function batchStaticOpaques(root: Group, table: Table, _renderApi: ThreeRenderApi): number {
	const animatables = new Set(table.getAnimatables().map(a => a.getName()))
	const movables = new Set(table.getMovables().map(a => a.getName()))
	const isAnimated = (o: any): boolean => {
		for (let p = o.parent; p && p !== root; p = p.parent)
			if (animatables.has(p.name) || movables.has(p.name)) return true
		return false
	}
	const buckets = new Map<string, { material: MeshStandardMaterial; meshes: Mesh[] }>()
	root.traverse((o: any) => {
		if (!o.isMesh || !o.geometry || !o.material) return
		if (Array.isArray(o.material)) return
		const mat = o.material as MeshStandardMaterial
		if (!canBatch(mat) || isAnimated(o)) return
		if (o.userData?.isProceduralDMD || o.name.startsWith('DMD_')) return
		if (o.name.toLowerCase().includes('ball')) return
		const geo = o.geometry as BufferGeometry
		if (!geo.getAttribute('position')) return
		const key = `${(mat as any).uuid ?? mat.name}:${signature(geo)}`
		const bucket = buckets.get(key) ?? { material: mat, meshes: [] }
		if (!buckets.has(key)) buckets.set(key, bucket)
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
			if (g.getIndex()) {
				totalIndices += g.getIndex()?.count
				hasIndex = true
			}
		}
		if (totalVerts < VERTEX_THRESHOLD) continue
		try {
			const batched = new BatchedMesh(
				meshes.length,
				totalVerts,
				hasIndex ? totalIndices : totalVerts * 2,
				material,
			)
			batched.name = `batched:${material.name || 'opaque'}:${meshes.length}`
			batched.perObjectFrustumCulled = true
			for (const mesh of meshes) {
				mesh.updateMatrixWorld(true)
				const geoId = batched.addGeometry(mesh.geometry as BufferGeometry)
				const instanceId = batched.addInstance(geoId)
				batched.setMatrixAt(instanceId, mesh.matrixWorld)
				mesh.visible = false
			}
			batched.computeBoundingBox()
			batched.computeBoundingSphere()
			root.add(batched)
			count++
		} catch {}
	}
	return count
}

export function instancedBulbs(root: Group, table: Table, _renderApi: ThreeRenderApi): number {
	const group = root.getObjectByName('lightBulbs') as Group | undefined
	if (!group) return 0
	const bulbs = Object.values(table.lights).filter(l => (l as any).isBulbLight?.())
	if (bulbs.length < 6) return 0

	const socketMeshes: Mesh[] = []
	group.traverse((o: any) => {
		if (!o.isMesh) return
		const n = (o.name || '').toLowerCase()
		if (n.includes('socket')) socketMeshes.push(o)
	})
	if (socketMeshes.length < 4) return 0

	try {
		const mg = new ThreeMeshGenerator()
		const baseSocket = loadMesh('bulb-socket-mesh')
		const socketGeo = mg.convertToBufferGeometry(baseSocket.clone('bulb.socket'))
		const mat = socketMeshes[0].material as MeshStandardMaterial
		const instanced = new InstancedMesh(socketGeo, mat, bulbs.length)
		instanced.name = `instanced:bulb-socket:${bulbs.length}`
		instanced.frustumCulled = false
		for (let i = 0; i < bulbs.length; i++) {
			if (i < socketMeshes.length) {
				socketMeshes[i].updateMatrixWorld(true)
				instanced.setMatrixAt(i, socketMeshes[i].matrixWorld)
			} else {
				const data: any = (bulbs[i] as any).data
				const s = data.meshRadius ?? 20
				const h = table.getSurfaceHeight(data.szSurface, data.center.x, data.center.y) * table.getScaleZ()
				const m = new Matrix4().makeScale(s, s, s * table.getScaleZ())
				m.setPosition(data.center.x, data.center.y, h)
				instanced.setMatrixAt(i, m)
			}
		}
		instanced.instanceMatrix.needsUpdate = true
		instanced.computeBoundingBox()
		instanced.computeBoundingSphere()
		for (const m of socketMeshes) m.visible = false
		root.add(instanced)
		return 1
	} catch {
		return 0
	}
}

export function optimizeScene(
	root: Group,
	table: Table,
	renderApi: ThreeRenderApi,
	opts: { batched?: boolean; instanced?: boolean } = {},
): { batched: number; instanced: number } {
	const batched = (opts.batched ?? true) ? batchStaticOpaques(root, table, renderApi) : 0
	const instanced = (opts.instanced ?? true) ? instancedBulbs(root, table, renderApi) : 0
	return { batched, instanced }
}
