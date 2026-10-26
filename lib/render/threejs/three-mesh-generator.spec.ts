// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import type * as THREE from 'three'
import { Mesh } from '../../vpt/mesh.js'
import { ThreeMeshGenerator } from './three-mesh-generator.js'

chai.use((sinonChai as any).default ?? sinonChai)

describe('ThreeMeshGenerator.convertToBufferGeometry known answers', () => {
	it('maps positions and normals verbatim and flips v', () => {
		const generator = new ThreeMeshGenerator()
		const mesh = Mesh.fromArray(
			[
				[0, 0, 0, 1, 0, 0, 0.25, 0.25],
				[1, 0, 0, 0, 1, 0, 0.5, 0.5],
				[0, 1, 0, 0, 0, 1, 1, 1],
			],
			[0, 1, 2],
		)
		const geometry = generator.convertToBufferGeometry(mesh)
		expect(Array.from(geometry.getAttribute('position').array)).to.deep.equal([0, 0, 0, 1, 0, 0, 0, 1, 0])
		expect(Array.from(geometry.getAttribute('normal').array)).to.deep.equal([1, 0, 0, 0, 1, 0, 0, 0, 1])
		expect(Array.from(geometry.getAttribute('uv').array)).to.deep.equal([0.25, 0.75, 0.5, 0.5, 1, 0])
		const index = geometry.getIndex()
		expect(index).to.not.equal(null)
		expect(Array.from((index as THREE.BufferAttribute).array)).to.deep.equal([0, 1, 2])
	})

	it('computes exact face normals when the mesh carries none', () => {
		const generator = new ThreeMeshGenerator()
		const mesh = Mesh.fromArray(
			[
				[0, 0, 0, 0, 0, 0, 0, 0],
				[1, 0, 0, 0, 0, 0, 1, 0],
				[0, 1, 0, 0, 0, 0, 0, 1],
			],
			[0, 1, 2],
		)
		const geometry = generator.convertToBufferGeometry(mesh)
		expect(Array.from(geometry.getAttribute('normal').array)).to.deep.equal([0, 0, 1, 0, 0, 1, 0, 0, 1])
	})
})
