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
import { loadMesh } from '../../vpt/mesh-loader.js'
import type { Table } from '../../vpt/table/table.js'
import { ThreeMeshGenerator } from './three-mesh-generator.js'
import type { ThreeRenderApi } from './three-render-api.js'

const VERTEX_THRESHOLD = 100

const RE_VR = /vr_/i
const RE_CAB = /vrcab|cabinet|lockbar|pincab/i

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

function geoHash(geo: BufferGeometry): string {
	const pos = geo.getAttribute('position')
	const idx = geo.getIndex()
	return `${pos.count}:${idx ? idx.count : 0}:${signature(geo)}`
}

function materialKey(mat: MeshStandardMaterial): string {
	const ud = mat.userData as any
	const map = (mat.map as any)?.name ?? 'nomap'
	const pending = ud.pendingMap ?? ud.pendingmap ?? ''
	return `${mat.name ?? 'noname'}|${map}|${pending}|${mat.transparent ? 't' : 'o'}|${mat.polygonOffset ? `${mat.polygonOffsetFactor}/${mat.polygonOffsetUnits}` : '0'}|${ud.__addBlend ? 'a' : 'o'}|${ud.__isBaked ? 'b' : 'o'}`
}

function canBatch(mat: MeshStandardMaterial): boolean {
	if (!mat || mat.transparent || (mat.userData as any).__addBlend) return false
	const ud = mat.userData as any
	if (ud.pendingMap || ud.pendingmap || ud.pendingNormalMap || ud.pendingEnvMap || ud.pendingEmissiveMap) return false
	return true
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

function isInVrCab(o: any, root: Group): boolean {
	for (let p = o; p && p !== root; p = p.parent) {
		const n = (p.name || '').toLowerCase()
		if (isVrCabName(n)) return true
	}
	return false
}

function isInBalls(o: any, root: Group): boolean {
	for (let p = o; p && p !== root; p = p.parent) {
		const n = (p.name || '').toLowerCase()
		if (n === 'balls' || n.startsWith('ball')) return true
	}
	return false
}

export function batchStaticOpaques(root: Group, table: Table, _renderApi: ThreeRenderApi): number {
	root.updateMatrixWorld(true)
	const invRoot = new Matrix4().copy(root.matrixWorld).invert()
	const movables = new Set(table.getMovables().map(a => a.getName()))
	const primitives = new Set(Object.values(table.primitives).map(p => p.getName()))
	const rubbers = new Set(Object.values(table.rubbers).map(r => r.getName()))
	const animatables = new Set(table.getAnimatables().map(a => a.getName()))

	const low = isLowQuality()
	const isAnimated = (o: any): boolean => {
		for (let p = o.parent; p && p !== root; p = p.parent) {
			if (low) {
				if (movables.has(p.name)) return true
				if (animatables.has(p.name) && !primitives.has(p.name)) return true
				if (primitives.has(p.name)) {
					const prim: any = (table as any).primitives?.[p.name]
					const frames = prim?.data?.mesh?.animationFrames?.length ?? 0
					if (frames > 0) return true
					if (prim?.data?.isCollidable) return false
					continue
				}
				if (rubbers.has(p.name)) return true
				continue
			}
			if (primitives.has(p.name) || rubbers.has(p.name)) return true
			if (movables.has(p.name) || animatables.has(p.name)) return true
		}
		return false
	}

	const dmdNames = new Set<string>()
	for (const k in (table as any).flashers) {
		const fl = (table as any).flashers[k]
		if (fl?.data?.isDMD) dmdNames.add(fl.getName().toLowerCase())
	}
	for (const k in (table as any).textboxes) {
		const tb = (table as any).textboxes[k]
		if (tb?.data?.isDMD) dmdNames.add(tb.getName().toLowerCase())
	}

	const buckets = new Map<string, { material: MeshStandardMaterial; meshes: Mesh[] }>()
	root.traverse((o: any) => {
		if (!o.isMesh || !o.geometry || !o.material) return
		if ((o as any).isBatchedMesh || (o as any).isInstancedMesh) return
		if (Array.isArray(o.material)) return
		if (!isEffectiveVisible(o, root)) return
		if (isInLightBulbs(o, root)) return
		if (isInVrCab(o, root)) return
		if (isInBalls(o, root)) return
		const mat = o.material as MeshStandardMaterial
		if (!canBatch(mat)) return
		if (isAnimated(o)) return
		const n = (o.name || '').toLowerCase()
		if (mat.name && mat.name.toLowerCase().includes('ball')) return
		if (o.userData?.isProceduralDMD || o.name.startsWith('DMD_') || n.includes('dmd') || dmdNames.has(n)) return
		if (o.userData?.isCabinetButton || /button|coin|plunger|tour|start|fire|magna/i.test(o.name)) return
		if (n.includes('ball')) return
		if (isVrCabName(n)) return
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
		const uniqueGeos = new Set(meshes.map(m => geoHash(m.geometry as BufferGeometry)))
		if (uniqueGeos.size === 1 && meshes.length >= 3) {
			const baseGeo = meshes[0].geometry as BufferGeometry
			const instanced = new InstancedMesh(baseGeo, material, meshes.length)
			instanced.name = `instanced:generic:${material.name || 'opaque'}:${meshes.length}`
			instanced.frustumCulled = true
			for (let i = 0; i < meshes.length; i++) {
				const mesh = meshes[i]
				mesh.updateMatrixWorld(true)
				const local = new Matrix4().multiplyMatrices(invRoot, mesh.matrixWorld)
				instanced.setMatrixAt(i, local)
			}
			instanced.instanceMatrix.needsUpdate = true
			instanced.computeBoundingBox()
			instanced.computeBoundingSphere()
			;(instanced.geometry as any).computeBoundsTree?.({ includeInstances: true } as any)
			root.add(instanced)
			for (const mesh of meshes) mesh.visible = false
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
		for (const mesh of meshes) mesh.visible = false
		count++
	}
	return count
}

export function instancedBulbs(root: Group, table: Table, _renderApi: ThreeRenderApi): number {
	for (const c of (root as any).children as any[]) if (String(c.name).startsWith('instanced:bulb')) return 0
	root.updateMatrixWorld(true)
	const invRoot = new Matrix4().copy(root.matrixWorld).invert()
	const group = root.getObjectByName('lightBulbs') as Group | undefined
	if (!group) return 0
	const bulbs = Object.values(table.lights).filter(l => (l as any).isBulbLight?.() || (l as any).data?.bulbLight)
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
					const local = new Matrix4().multiplyMatrices(invRoot, meshes[i].matrixWorld)
					instanced.setMatrixAt(i, local)
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
			try {
				;(instanced.geometry as any).computeBoundsTree?.({ includeInstances: true } as any)
			} catch {}
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
				const local = new Matrix4().multiplyMatrices(invRoot, socketMeshes[i].matrixWorld)
				instanced.setMatrixAt(i, local)
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
		;(instanced.geometry as any).computeBoundsTree?.({ includeInstances: true } as any)
		for (const m of socketMeshes) m.visible = false
		root.add(instanced)
		instancedCount++
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
