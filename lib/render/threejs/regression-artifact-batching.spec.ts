// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import * as THREE from 'three'
import { _resetQualityCache, isLowQuality } from '../../util/quality.js'
import type { Table } from '../../vpt/table/table.js'
import { batchStaticOpaques, canBatch } from './three-batched-builder.js'
import type { ThreeRenderApi } from './three-render-api.js'

chai.use((sinonChai as any).default ?? sinonChai)

function makeMesh(name: string, geometry: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
	const mesh = new THREE.Mesh(geometry, mat)
	mesh.name = name
	return mesh
}

describe('regression: artifact batching', () => {
	it('BatchedMesh must not batch baked materials', async () => {
		const root = new THREE.Group()
		root.name = 'table'
		const mockTable = {
			getMovables: () => [],
			getAnimatables: () => [],
			getSurfaceHeight: () => 0,
			getScaleZ: () => 1,
			primitives: { testPrim: { data: { staticRendering: true }, getName: () => 'testPrim' } },
			rubbers: {},
			lights: {},
			flashers: {},
			textboxes: {},
			getDimensions: () => ({ width: 100, height: 100 }),
		}
		const bakedMat = new THREE.MeshStandardMaterial({ color: 0xffffff })
		bakedMat.name = 'material:Bake'
		bakedMat.userData.__isBaked = true
		bakedMat.userData.__addBlend = false
		bakedMat.map = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
		bakedMat.map.name = 'vlm.nestmap0'
		bakedMat.polygonOffset = false
		const bakedGeom = new THREE.BoxGeometry(10, 10, 1)
		const bakedMesh = makeMesh('primitive-BM_armp0', bakedGeom, bakedMat)
		bakedMesh.position.set(0, 0, 0)
		bakedMesh.updateMatrixWorld(true)
		root.add(bakedMesh)
		const woodMat = new THREE.MeshStandardMaterial({ color: 0x8b4513 })
		woodMat.name = 'Wood'
		woodMat.roughness = 0.8
		const woodGeom = new THREE.BoxGeometry(10, 10, 1)
		const woodMesh1 = makeMesh('primitive-wood1', woodGeom, woodMat)
		woodMesh1.position.set(20, 0, 0)
		woodMesh1.updateMatrixWorld(true)
		const woodMesh2 = makeMesh('primitive-wood2', woodGeom.clone(), woodMat.clone())
		;(woodMesh2.material as THREE.Material).name = 'Wood'
		woodMesh2.position.set(40, 0, 0)
		woodMesh2.updateMatrixWorld(true)
		root.add(woodMesh1)
		root.add(woodMesh2)
		root.updateMatrixWorld(true)
		expect(bakedMesh.visible).to.equal(true)
		const api = { getMapGenerator: () => ({ getCache: () => new Map() }), getMaterialGenerator: () => ({}) }
		batchStaticOpaques(root, mockTable as unknown as Table, api as unknown as ThreeRenderApi)
		expect(bakedMesh.visible).to.equal(true)
		let batchedBaked = false
		root.traverse(o => {
			const candidate = o as THREE.Object3D & {
				isBatchedMesh?: boolean
				isInstancedMesh?: boolean
				material?: { name?: string; userData?: Record<string, unknown> }
			}
			if (candidate.isBatchedMesh || candidate.isInstancedMesh) {
				const matName = (candidate.material?.name || '').toLowerCase()
				if (matName.includes('bake') || candidate.material?.userData?.__isBaked) batchedBaked = true
			}
		})
		expect(batchedBaked).to.equal(false)
	})

	it('transparent meshes must never batch, even in low-quality mode', () => {
		const root = new THREE.Group()
		root.name = 'table'
		const mockTable = {
			getMovables: () => [],
			getAnimatables: () => [],
			getSurfaceHeight: () => 0,
			getScaleZ: () => 1,
			primitives: {},
			rubbers: {},
			lights: {},
			flashers: {},
			textboxes: {},
			getDimensions: () => ({ width: 100, height: 100 }),
		}
		const makeGlass = () => {
			const glassMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.5 })
			glassMat.name = 'glass'
			return glassMat
		}
		const nearMesh = makeMesh('primitive-glass-near', new THREE.BoxGeometry(10, 10, 1, 4, 4, 4), makeGlass())
		nearMesh.position.set(0, 0, 10)
		const farMesh = makeMesh('primitive-glass-far', new THREE.BoxGeometry(10, 10, 1, 4, 4, 4), makeGlass())
		farMesh.position.set(0, 0, 100)
		root.add(nearMesh)
		root.add(farMesh)
		root.updateMatrixWorld(true)
		const api = { getMapGenerator: () => ({ getCache: () => new Map() }), getMaterialGenerator: () => ({}) }
		const hadWindow = 'window' in globalThis
		const hadLocation = 'location' in globalThis
		const prevWindow = (globalThis as any).window
		const prevLocation = (globalThis as any).location
		try {
			;(globalThis as any).window = { innerWidth: 1920, innerHeight: 1080 }
			;(globalThis as any).location = { search: '?quality=low' }
			_resetQualityCache()
			expect(isLowQuality()).to.equal(true)
			expect(canBatch(makeGlass())).to.equal(false)
			const buckets = batchStaticOpaques(root, mockTable as unknown as Table, api as unknown as ThreeRenderApi)
			expect(buckets).to.equal(0)
			expect(nearMesh.visible).to.equal(true)
			expect(farMesh.visible).to.equal(true)
			let batchedAny = false
			root.traverse(o => {
				if ((o as any).isBatchedMesh || (o as any).isInstancedMesh) batchedAny = true
			})
			expect(batchedAny).to.equal(false)
		} finally {
			if (hadWindow) (globalThis as any).window = prevWindow
			else delete (globalThis as any).window
			if (hadLocation) (globalThis as any).location = prevLocation
			else delete (globalThis as any).location
			_resetQualityCache()
		}
	})
})
