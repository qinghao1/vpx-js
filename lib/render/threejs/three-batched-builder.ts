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

const VERTEX_THRESHOLD = 200

function signature(geo: BufferGeometry): string {
	const hasIndex = !!geo.getIndex()
	const hasUv = !!geo.getAttribute('uv')
	const hasNormal = !!geo.getAttribute('normal')
	const hasColor = !!geo.getAttribute('color')
	const hasTangent = !!geo.getAttribute('tangent')
	return `${hasIndex ? 'i' : 'n'}:${hasUv ? 'uv' : 'nou'}:${hasNormal ? 'n' : 'non'}:${hasColor ? 'c' : 'nc'}:${hasTangent ? 't' : 'nt'}`
}

function canBatch(mat: MeshStandardMaterial): boolean {
	return !!mat && !mat.transparent && !mat.polygonOffset && !(mat.userData as any).__addBlend
}

function isEffectiveVisible(o: any, root: Group): boolean {
	if (!o.visible) return false
	for (let p = o.parent; p && p !== root; p = p.parent) if (!p.visible) return false
	return true
}

function isInLightBulbs(o: any, root: Group): boolean {
	for (let p = o.parent; p && p !== root; p = p.parent) if (p.name === 'lightBulbs') return true
	return false
}

export function batchStaticOpaques(root: Group, table: Table, _renderApi: ThreeRenderApi): number {
	const movables = new Set(table.getMovables().map(a => a.getName()))
	const staticPrimitives = new Set(
		Object.values(table.primitives)
			.filter(p => (p as any).data?.staticRendering)
			.map(p => p.getName()),
	)
	const staticRubbers = new Set(
		Object.values(table.rubbers)
			.filter(r => (r as any).data?.staticRendering)
			.map(r => r.getName()),
	)
	const animatables = new Set(
		table
			.getAnimatables()
			.map(a => a.getName())
			.filter(n => !staticPrimitives.has(n) && !staticRubbers.has(n)),
	)

	const isAnimated = (o: any): boolean => {
		for (let p = o.parent; p && p !== root; p = p.parent) {
			if (staticPrimitives.has(p.name) || staticRubbers.has(p.name)) continue
			if (movables.has(p.name) || animatables.has(p.name)) return true
		}
		return false
	}

	const dmdNames = new Set<string>()
	try {
		for (const k in (table as any).flashers) {
			const fl = (table as any).flashers[k]
			if (fl?.data?.isDMD) dmdNames.add(fl.getName().toLowerCase())
		}
		for (const k in (table as any).textboxes) {
			const tb = (table as any).textboxes[k]
			if (tb?.data?.isDMD) dmdNames.add(tb.getName().toLowerCase())
		}
	} catch {}

	const buckets = new Map<string, { material: MeshStandardMaterial; meshes: Mesh[] }>()
	root.traverse((o: any) => {
		if (!o.isMesh || !o.geometry || !o.material) return
		if (Array.isArray(o.material)) return
		if (!isEffectiveVisible(o, root)) return
		if (isInLightBulbs(o, root)) return
		const mat = o.material as MeshStandardMaterial
		if (!canBatch(mat)) return
		if (isAnimated(o)) return
		const n = (o.name || '').toLowerCase()
		if (o.userData?.isProceduralDMD || o.name.startsWith('DMD_') || n.includes('dmd') || dmdNames.has(n)) return
		if (o.userData?.isCabinetButton || /button|coin|plunger|tour|start|fire|magna/i.test(o.name)) return
		if (n.includes('ball')) return
		const geo = o.geometry as BufferGeometry
		if (!geo.getAttribute('position')) return
		const key = `${(mat as any).uuid ?? mat.name}:${signature(geo)}:${o.renderOrder ?? 0}:${o.castShadow ? 1 : 0}:${o.receiveShadow ? 1 : 0}`
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
			batched.frustumCulled = true
			for (const mesh of meshes) {
				mesh.updateMatrixWorld(true)
				const geoId = batched.addGeometry(mesh.geometry as BufferGeometry)
				const instanceId = batched.addInstance(geoId)
				batched.setMatrixAt(instanceId, mesh.matrixWorld)
			}
			batched.computeBoundingBox()
			batched.computeBoundingSphere()
			root.add(batched)
			for (const mesh of meshes) mesh.visible = false
			count++
		} catch {}
	}
	return count
}

export function instancedBulbs(root: Group, table: Table, _renderApi: ThreeRenderApi): number {
	const group = root.getObjectByName('lightBulbs') as Group | undefined
	if (!group) return 0
	const bulbs = Object.values(table.lights).filter(l => (l as any).isBulbLight?.())
	if (bulbs.length < 2) return 0

	const socketMeshes: Mesh[] = []
	const lightMeshes: Mesh[] = []
	group.traverse((o: any) => {
		if (!o.isMesh) return
		const n = (o.name || '').toLowerCase()
		if (n.includes('socket')) socketMeshes.push(o)
		else if (n.includes('light') || n.includes('bulb')) lightMeshes.push(o)
	})

	let instancedCount = 0
	const tryInstanced = (meshes: Mesh[], baseName: string, kind: string): boolean => {
		if (meshes.length < 2) return false
		try {
			const mg = new ThreeMeshGenerator()
			const baseMesh = loadMesh(baseName)
			const baseGeo = mg.convertToBufferGeometry(baseMesh.clone(`${kind}.instanced`))
			const mat = meshes[0].material as MeshStandardMaterial
			if (!mat) return false
			const instanced = new InstancedMesh(baseGeo, mat, bulbs.length)
			instanced.name = `instanced:${kind}:${bulbs.length}`
			instanced.frustumCulled = false
			for (let i = 0; i < bulbs.length; i++) {
				if (i < meshes.length) {
					meshes[i].updateMatrixWorld(true)
					instanced.setMatrixAt(i, meshes[i].matrixWorld)
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
			for (const m of meshes) m.visible = false
			root.add(instanced)
			return true
		} catch {
			return false
		}
	}

	if (socketMeshes.length >= 2 && tryInstanced(socketMeshes, 'bulb-socket-mesh', 'bulb-socket')) instancedCount++
	if (lightMeshes.length >= 2 && tryInstanced(lightMeshes, 'bulb-light-mesh', 'bulb-light')) instancedCount++

	if (instancedCount === 0 && socketMeshes.length >= 2) {
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
			instancedCount++
		} catch {}
	}
	return instancedCount
}

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
