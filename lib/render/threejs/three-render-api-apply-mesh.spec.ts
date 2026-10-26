// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import * as THREE from 'three'
import { Mesh } from '../../vpt/mesh.js'
import { ThreeMeshGenerator } from './three-mesh-generator.js'
import { ThreeRenderApi } from './three-render-api.js'

chai.use((sinonChai as any).default ?? sinonChai)

describe('ThreeRenderApi.applyMeshToNode geometry paths', () => {
	const quadA = [
		[0, 0, 0, 0, 0, 1, 0, 0],
		[1, 0, 0, 0, 0, 1, 1, 0],
		[1, 1, 0, 0, 0, 1, 1, 1],
		[0, 1, 0, 0, 0, 1, 0, 1],
	]
	const quadB = [
		[5, 5, 5, 1, 0, 0, 0, 0],
		[6, 5, 5, 1, 0, 0, 1, 0],
		[6, 6, 5, 1, 0, 0, 1, 1],
		[5, 6, 5, 1, 0, 0, 0, 1],
	]
	function destMeshFor(verts: number[][]): THREE.Mesh {
		const geometry = new ThreeMeshGenerator().convertToBufferGeometry(Mesh.fromArray(verts, [0, 1, 2, 0, 2, 3]))
		return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial())
	}

	it('copies positions and normals in place for matching counts', () => {
		const api = new ThreeRenderApi()
		const dest = destMeshFor(quadA)
		api.applyMeshToNode(Mesh.fromArray(quadB, []), dest)
		expect(Array.from((dest.geometry.getAttribute('position') as THREE.BufferAttribute).array)).to.deep.equal([
			5, 5, 5, 6, 5, 5, 6, 6, 5, 5, 6, 5,
		])
		expect(Array.from((dest.geometry.getAttribute('normal') as THREE.BufferAttribute).array)).to.deep.equal([
			1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
		])
	})

	it('throws when the vertex counts mismatch', () => {
		const api = new ThreeRenderApi()
		const dest = destMeshFor(quadA)
		expect(() => api.applyMeshToNode(Mesh.fromArray([...quadB, [0, 0, 0, 0, 0, 1, 0, 0]], []), dest)).to.throw(
			'Trying to apply geometry',
		)
	})

	it('adds normals when the destination has none', () => {
		const api = new ThreeRenderApi()
		const geometry = new THREE.BufferGeometry()
		geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3))
		const dest = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial())
		api.applyMeshToNode(Mesh.fromArray(quadB, []), dest)
		const normal = dest.geometry.getAttribute('normal') as THREE.BufferAttribute
		expect(normal, 'normal attribute must be added').to.not.equal(undefined)
		expect(Array.from(normal.array)).to.deep.equal([1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0])
	})

	it('recomputes normals when the destination normal count disagrees', () => {
		const api = new ThreeRenderApi()
		const dest = destMeshFor(quadA)
		dest.geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 3))
		let recomputed = 0
		const original = dest.geometry.computeVertexNormals.bind(dest.geometry)
		dest.geometry.computeVertexNormals = () => {
			recomputed++
			return original()
		}
		api.applyMeshToNode(Mesh.fromArray(quadB, []), dest)
		expect(recomputed, 'stale normals must be recomputed').to.equal(1)
	})

	it('rebuilds the BVH after applying geometry', () => {
		const api = new ThreeRenderApi()
		const dest = destMeshFor(quadA)
		let disposed = 0
		const computed: unknown[] = []
		const bvhGeometry = dest.geometry as unknown as Record<string, unknown>
		bvhGeometry.boundsTree = {}
		bvhGeometry.disposeBoundsTree = () => {
			disposed++
		}
		bvhGeometry.computeBoundsTree = (opts: unknown) => {
			computed.push(opts)
		}
		api.applyMeshToNode(Mesh.fromArray(quadB, []), dest)
		expect(disposed).to.equal(1)
		expect(computed).to.deep.equal([{}])
	})
})
