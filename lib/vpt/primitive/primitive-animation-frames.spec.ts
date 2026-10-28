// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import * as THREE from 'three'
import { TableBuilder } from '../../../test/table-builder.js'
import { ThreeMeshGenerator } from '../../render/threejs/three-mesh-generator.js'
import { ThreeRenderApi } from '../../render/threejs/three-render-api.js'
import { Vertex3DNoTex2 } from '../../util/vertex.js'
import { FrameData, VertData } from '../animation.js'
import { Mesh } from '../mesh.js'
import type { PrimitiveState } from './primitive-state.js'

chai.use((sinonChai as any).default ?? sinonChai)

function frameVert(x: number, y: number, z: number, nx: number, ny: number, nz: number): Vertex3DNoTex2 {
	const v = new Vertex3DNoTex2()
	v.x = x
	v.y = y
	v.z = z
	v.nx = nx
	v.ny = ny
	v.nz = nz
	v.tu = 0
	v.tv = 0
	return v
}

function frameData(verts: Array<[number, number, number, number, number, number]>): FrameData {
	const frame = new FrameData()
	frame.frameVerts = verts.map(v => new VertData(v[0], v[1], v[2], v[3], v[4], v[5]))
	return frame
}

/** Two-vertex mesh with two animation frames (slide +x, tilt normal). */
function animatedMesh(): Mesh {
	const mesh = new Mesh('anim')
	mesh.vertices = [frameVert(0, 0, 0, 0, 0, 1), frameVert(1, 0, 0, 0, 0, 1)]
	mesh.indices = [0, 1]
	mesh.animationFrames = [
		frameData([
			[0, 0, 0, 0, 0, 1],
			[1, 0, 0, 0, 0, 1],
		]),
		frameData([
			[2, 0, 0, 0, 1, 0],
			[3, 0, 0, 0, 1, 0],
		]),
	]
	return mesh
}

describe('primitive animation frame fast path', () => {
	it('routes ticks through prebuilt arrays with no per-frame mesh or geometry allocs', () => {
		const table = new TableBuilder().addPrimitive('pDynamic', { staticRendering: false }).build()
		const updater = table.primitives.pDynamic.getUpdater()
		const mesh = animatedMesh()
		updater.setMesh(mesh)
		const generator = new ThreeMeshGenerator()
		const dest = new THREE.Mesh(generator.convertToBufferGeometry(mesh))
		const calls: Array<{ positions: Float32Array; normals: Float32Array; bounds: Float32Array }> = []
		const fakeApi = {
			applyVisibility: () => {},
			applyFrameArrays: (positions: Float32Array, normals: Float32Array, bounds: Float32Array) => {
				calls.push({ positions, normals, bounds })
			},
			applyMeshToNode: () => {
				throw new Error('legacy path must not run when the backend supports frame arrays')
			},
		}
		updater.applyState(dest as never, { currentFrame: 0.5 } as PrimitiveState, fakeApi as never, table)
		expect(calls).to.have.length(1)
		const { positions, normals, bounds } = calls[0]!
		// Midpoint lerp of the two frames.
		expect(Array.from(positions)).to.deep.equal([1, 0, 0, 2, 0, 0])
		expect(Array.from(normals)).to.deep.equal([0, 0.5, 0.5, 0, 0.5, 0.5])
		// Union of both frame bounds.
		expect(Array.from(bounds)).to.deep.equal([0, 0, 0, 3, 0, 0])
		// Scratch reuse: a second tick writes the same buffers again.
		updater.applyState(dest as never, { currentFrame: 1 } as PrimitiveState, fakeApi as never, table)
		expect(calls).to.have.length(2)
		expect(calls[1]!.positions).to.equal(positions)
		expect(Array.from(calls[1]!.positions)).to.deep.equal([2, 0, 0, 3, 0, 0])
	})

	it('falls back to the legacy mesh path on backends without frame arrays', () => {
		const table = new TableBuilder().addPrimitive('pDynamic', { staticRendering: false }).build()
		const updater = table.primitives.pDynamic.getUpdater()
		updater.setMesh(animatedMesh())
		let legacyCalls = 0
		const fakeApi = {
			applyVisibility: () => {},
			applyMeshToNode: () => {
				legacyCalls++
			},
		}
		const dest = { isMesh: true, geometry: {} }
		updater.applyState(dest as never, { currentFrame: 0.5 } as PrimitiveState, fakeApi as never, table)
		expect(legacyCalls).to.equal(1)
	})

	it('applyFrameArrays matches the legacy copy including winding negation and bounds', () => {
		const api = new ThreeRenderApi()
		const mesh = animatedMesh()
		const generator = new ThreeMeshGenerator()
		const destLegacy = new THREE.Mesh(generator.convertToBufferGeometry(mesh))
		const destFast = new THREE.Mesh(generator.convertToBufferGeometry(mesh))
		// Interpolated frame 0.5 in raw mesh coords (what the updater prebuilds).
		const positions = new Float32Array([1, 0, 0, 2, 0, 0])
		const normals = new Float32Array([0, 0.5, 0.5, 0, 0.5, 0.5])
		const bounds = new Float32Array([0, 0, 0, 3, 0, 0])
		api.applyFrameArrays(positions, normals, bounds, destFast)
		expect(Array.from((destFast.geometry.getAttribute('position') as any).array)).to.deep.equal([1, 0, 0, 2, 0, 0])
		// Backend winding convention: stored normals are negated.
		expect(Array.from((destFast.geometry.getAttribute('normal') as any).array)).to.deep.equal([
			-0, -0.5, -0.5, -0, -0.5, -0.5,
		])
		expect(destFast.geometry.boundingBox!.min.toArray()).to.deep.equal([0, 0, 0])
		expect(destFast.geometry.boundingBox!.max.toArray()).to.deep.equal([3, 0, 0])
		// Every drawn vertex sits inside the installed sphere.
		expect(destFast.geometry.boundingSphere!.radius).to.be.greaterThan(0)
		// Legacy path on the equivalent interpolated mesh agrees on positions.
		const interp = new Mesh('anim')
		interp.vertices = [frameVert(1, 0, 0, 0, 0.5, 0.5), frameVert(2, 0, 0, 0, 0.5, 0.5)]
		api.applyMeshToNode(interp, destLegacy)
		expect(Array.from((destLegacy.geometry.getAttribute('position') as any).array)).to.deep.equal(
			Array.from((destFast.geometry.getAttribute('position') as any).array),
		)
		expect(Array.from((destLegacy.geometry.getAttribute('normal') as any).array)).to.deep.equal(
			Array.from((destFast.geometry.getAttribute('normal') as any).array),
		)
	})
})
