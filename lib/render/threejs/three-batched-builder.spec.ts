// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import * as THREE from 'three'
import type { Table } from '../../vpt/table/table.js'
import { batchStaticOpaques, instancedBulbs } from './three-batched-builder.js'
import type { ThreeRenderApi } from './three-render-api.js'

function mockTable(lights: Record<string, unknown> = {}, flashers: Record<string, unknown> = {}): Table {
	return {
		getMovables: () => [],
		getAnimatables: () => [],
		getSurfaceHeight: () => 100,
		getScaleZ: () => 1,
		primitives: {},
		rubbers: {},
		lights,
		flashers,
		textboxes: {},
		getDimensions: () => ({ width: 1000, height: 2000 }),
	} as unknown as Table
}

const stubApi = {
	getMapGenerator: () => ({ getCache: () => new Map() }),
	getMaterialGenerator: () => ({}),
} as unknown as ThreeRenderApi

function makeMesh(name: string, geometry: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
	const mesh = new THREE.Mesh(geometry, mat)
	mesh.name = name
	return mesh
}

function bulbTable(): { root: THREE.Group; table: Table } {
	const root = new THREE.Group()
	root.name = 'table'
	const group = new THREE.Group()
	group.name = 'lightBulbs'
	root.add(group)
	const lights: Record<string, unknown> = {}
	for (const [i, cx] of [500, 900].entries()) {
		// Production bulb meshes carry vertex-baked center+radius with identity node
		// transforms (see light-view.ts), and per-light material names.
		const item = new THREE.Group()
		item.name = `light${i}`
		item.matrixAutoUpdate = false
		const hullGeo = new THREE.BoxGeometry(2, 2, 2)
		hullGeo.translate(cx, 200, 100)
		const hullMat = new THREE.MeshStandardMaterial({ color: 0xffffff })
		hullMat.name = `bulb.light:light${i}`
		const hull = makeMesh('bulb.light', hullGeo, hullMat)
		hull.matrixAutoUpdate = false
		const glowGeo = new THREE.PlaneGeometry(10, 10)
		glowGeo.translate(cx, 200, 101)
		const glowMat = new THREE.MeshStandardMaterial({ color: 0xffffff })
		glowMat.name = `bulb.glow:light${i}`
		const glow = makeMesh('bulb.glow', glowGeo, glowMat)
		glow.matrixAutoUpdate = false
		const socketGeo = new THREE.BoxGeometry(1, 1, 1)
		socketGeo.translate(cx, 200, 99)
		const socket = makeMesh('bulb.socket', socketGeo, new THREE.MeshStandardMaterial({ color: 0x181818 }))
		socket.matrixAutoUpdate = false
		item.add(hull, glow, socket)
		group.add(item)
		lights[`l${i}`] = {
			data: { bulbLight: true, center: { x: cx, y: 200 }, meshRadius: 20, szSurface: '' },
			isBulbLight: () => true,
		}
	}
	root.updateMatrixWorld(true)
	return { root, table: mockTable(lights) }
}

function collect(root: THREE.Group): {
	instanced: THREE.InstancedMesh[]
	batched: THREE.BatchedMesh[]
	meshes: THREE.Mesh[]
} {
	const instanced: THREE.InstancedMesh[] = []
	const batched: THREE.BatchedMesh[] = []
	const meshes: THREE.Mesh[] = []
	root.traverse(o => {
		if ((o as THREE.InstancedMesh).isInstancedMesh) instanced.push(o as THREE.InstancedMesh)
		else if ((o as THREE.BatchedMesh).isBatchedMesh) batched.push(o as THREE.BatchedMesh)
		else if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh)
	})
	return { instanced, batched, meshes }
}

describe('instancedBulbs', () => {
	it('leaves bulb meshes uninstanced at their baked positions', () => {
		const { root, table } = bulbTable()
		expect(instancedBulbs(root, table, stubApi)).to.equal(0)
		const { instanced, meshes } = collect(root)
		expect(instanced, 'no InstancedMesh may be created').to.have.lengthOf(0)
		expect(meshes).to.have.lengthOf(6)
		for (const mesh of meshes) expect(mesh.visible, `${mesh.name} stays visible`).to.equal(true)
		// The baked per-bulb centers survive: hulls sit at x=500/900, not piled at origin.
		const hulls = meshes.filter(m => m.name === 'bulb.light')
		const centers = hulls.map(m => {
			m.geometry.computeBoundingSphere()
			return m.geometry.boundingSphere?.center.x ?? Number.NaN
		})
		expect(centers).to.have.lengthOf(2)
		expect(centers[0]).to.be.closeTo(500, 2)
		expect(centers[1]).to.be.closeTo(900, 2)
	})

	it('leaves glow quads alone', () => {
		const { root, table } = bulbTable()
		instancedBulbs(root, table, stubApi)
		const { meshes } = collect(root)
		const glows = meshes.filter(m => m.name === 'bulb.glow')
		expect(glows).to.have.lengthOf(2)
		for (const glow of glows) {
			expect(glow.visible).to.equal(true)
			expect(glow.geometry.getAttribute('position').count).to.equal(4)
		}
	})
})

describe('batchStaticOpaques geometry identity', () => {
	it('never instances same-count different-shape meshes as copies of the first', () => {
		const root = new THREE.Group()
		root.name = 'table'
		const base = new THREE.MeshStandardMaterial({ color: 0x112233 })
		base.name = 'material:shared'
		// Same tessellation (same counts + signature), different shapes.
		const widths = [10, 50, 10]
		for (let i = 0; i < 3; i++) {
			const mat = base.clone()
			mat.name = 'material:shared'
			const mesh = makeMesh(`kicker-k${i}`, new THREE.BoxGeometry(widths[i] ?? 10, 10, 1, 4, 4, 4), mat)
			mesh.position.set(i * 100, 0, 0)
			const group = new THREE.Group()
			group.name = `kick${i}`
			group.add(mesh)
			root.add(group)
		}
		root.updateMatrixWorld(true)
		expect(batchStaticOpaques(root, mockTable(), stubApi)).to.equal(1)
		const { instanced, batched, meshes } = collect(root)
		expect(instanced, 'different shapes must not instance').to.have.lengthOf(0)
		expect(batched, 'different shapes take the BatchedMesh path').to.have.lengthOf(1)
		for (const mesh of meshes) {
			expect(mesh.visible).to.equal(false)
			expect((mesh.userData.__batched as { isInstanced?: boolean }).isInstanced).to.not.equal(true)
		}
	})

	it('still instances meshes that share one identical geometry', () => {
		const root = new THREE.Group()
		root.name = 'table'
		const shared = new THREE.BoxGeometry(10, 10, 1, 4, 4, 4)
		const groups: THREE.Group[] = []
		for (let i = 0; i < 3; i++) {
			const mat = new THREE.MeshStandardMaterial({ color: 0x112233 })
			mat.name = 'material:shared'
			const mesh = makeMesh(`kicker-k${i}`, shared, mat)
			mesh.position.set(i * 50, 0, 0)
			const group = new THREE.Group()
			group.name = `kick${i}`
			group.add(mesh)
			root.add(group)
			groups.push(group)
		}
		root.updateMatrixWorld(true)
		expect(batchStaticOpaques(root, mockTable(), stubApi)).to.equal(1)
		const { instanced, batched } = collect(root)
		expect(batched).to.have.lengthOf(0)
		expect(instanced).to.have.lengthOf(1)
		const mesh = instanced[0] as THREE.InstancedMesh
		expect(mesh.count).to.equal(3)
		// Per-mesh transforms survive instancing.
		const m4 = new THREE.Matrix4()
		for (const [i, group] of groups.entries()) {
			mesh.getMatrixAt(i, m4)
			const child = group.children[0] as THREE.Mesh
			child.updateMatrixWorld(true)
			expect(m4.elements[12]).to.be.closeTo(child.matrixWorld.elements[12] ?? 0, 0.01)
		}
		// The pre-batch matrix is saved so visibility toggles can restore the slot.
		for (const group of groups) {
			const child = group.children[0] as THREE.Mesh
			const info = child.userData.__batched as { isInstanced?: boolean; matrix?: THREE.Matrix4 }
			expect(info.isInstanced).to.equal(true)
			expect(info.matrix).to.be.instanceOf(THREE.Matrix4)
		}
	})
})

describe('batchStaticOpaques flasher exclusion', () => {
	it('never batches flasher meshes: the script can swap their image any tick', () => {
		const root = new THREE.Group()
		root.name = 'table'
		const flashers: Record<string, unknown> = {}
		for (const [i, name] of ['digit001', 'digit002'].entries()) {
			const mat = new THREE.MeshStandardMaterial({ color: 0xffffff })
			mat.name = 'material:shared'
			const mesh = makeMesh(`flasher-${name}`, new THREE.BoxGeometry(10, 10, 1, 4, 4, 4), mat)
			mesh.position.set(i * 100, 0, 0)
			const group = new THREE.Group()
			group.name = name
			group.add(mesh)
			root.add(group)
			flashers[name] = { getName: () => name, data: {} }
		}
		root.updateMatrixWorld(true)
		// Identical geometry/material would merge (cf. 'still merges true clones').
		expect(batchStaticOpaques(root, mockTable({}, flashers), stubApi)).to.equal(0)
		const { batched, instanced, meshes } = collect(root)
		expect(batched, 'no BatchedMesh may absorb flashers').to.have.lengthOf(0)
		expect(instanced, 'no InstancedMesh may absorb flashers').to.have.lengthOf(0)
		expect(meshes).to.have.lengthOf(2)
		for (const mesh of meshes) expect(mesh.visible, `${mesh.name} stays live`).to.equal(true)
	})
})

describe('batchStaticOpaques material identity', () => {
	function batchPair(
		matA: THREE.MeshStandardMaterial,
		matB: THREE.MeshStandardMaterial,
	): { buckets: number; meshes: THREE.Mesh[] } {
		const root = new THREE.Group()
		root.name = 'table'
		for (const [i, mat] of [matA, matB].entries()) {
			const mesh = makeMesh(`kicker-k${i}`, new THREE.BoxGeometry(10, 10, 1, 4, 4, 4), mat)
			mesh.position.set(i * 100, 0, 0)
			const group = new THREE.Group()
			group.name = `kick${i}`
			group.add(mesh)
			root.add(group)
		}
		root.updateMatrixWorld(true)
		const buckets = batchStaticOpaques(root, mockTable(), stubApi)
		return { buckets, meshes: collect(root).meshes }
	}

	it('does not merge same-name materials with different side', () => {
		const matA = new THREE.MeshStandardMaterial({ color: 0xff0000 })
		matA.name = 'material:shared'
		matA.side = THREE.FrontSide
		const matB = new THREE.MeshStandardMaterial({ color: 0xff0000 })
		matB.name = 'material:shared'
		matB.side = THREE.DoubleSide
		const { buckets, meshes } = batchPair(matA, matB)
		expect(buckets).to.equal(0)
		for (const mesh of meshes) expect(mesh.visible).to.equal(true)
	})

	it('does not merge same-name materials with different color or PBR props', () => {
		const matA = new THREE.MeshStandardMaterial({ color: 0xff0000, metalness: 0, roughness: 0.9 })
		matA.name = 'material:shared'
		const matB = new THREE.MeshStandardMaterial({ color: 0x0000ff, metalness: 1, roughness: 0.1 })
		matB.name = 'material:shared'
		expect(batchPair(matA, matB).buckets).to.equal(0)
	})

	it('still merges true clones', () => {
		const matA = new THREE.MeshStandardMaterial({ color: 0x112233 })
		matA.name = 'material:shared'
		const matB = matA.clone()
		matB.name = 'material:shared'
		const { buckets, meshes } = batchPair(matA, matB)
		expect(buckets).to.equal(1)
		for (const mesh of meshes) expect(mesh.visible).to.equal(false)
	})

	it('does not merge same-name materials with different node maps', () => {
		// Royal Flush 1976 wooden rails vs apron.
		const matA = new THREE.MeshStandardMaterial({ color: 0xffffff })
		matA.name = 'material:Plastic with an image opacity'
		;(matA.userData as any).__mapName = 'sidewood._h'
		const matB = new THREE.MeshStandardMaterial({ color: 0xffffff })
		matB.name = 'material:Plastic with an image opacity'
		;(matB.userData as any).__mapName = 'emblankapron'
		const { buckets, meshes } = batchPair(matA, matB)
		expect(buckets).to.equal(0)
		for (const mesh of meshes) expect(mesh.visible).to.equal(true)
	})
})
