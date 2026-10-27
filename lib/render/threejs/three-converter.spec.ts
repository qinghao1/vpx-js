// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import * as THREE from 'three'
import { Mesh } from '../../vpt/mesh.js'
import { ThreeConverter } from './three-converter.js'
import { ThreeMeshGenerator } from './three-mesh-generator.js'
import { ThreeNodeMaterialGenerator } from './three-node-material-generator.js'

chai.use((sinonChai as any).default ?? sinonChai)

describe('ThreeConverter.createMesh mapping', () => {
	function makeConverter(): ThreeConverter {
		return new ThreeConverter(
			new ThreeMeshGenerator(),
			{ getInitialMaterial: () => new THREE.MeshStandardMaterial() } as any,
			{},
		)
	}
	const box = () => new THREE.BoxGeometry(1, 1, 1)

	it('maps renderOrder from bulbGlow and depthBias with DMD clamps', () => {
		const converter = makeConverter()
		expect(converter.createMesh({ isVisible: true, geometry: box() } as any).renderOrder, 'default').to.equal(0)
		expect(
			converter.createMesh({
				isVisible: true,
				geometry: box(),
				bulbGlow: { color: 0xffffff },
				depthBias: 5,
			} as any).renderOrder,
			'bulb glow wins over depthBias',
		).to.equal(10)
		expect(converter.createMesh({ isVisible: true, geometry: box(), depthBias: 5 } as any).renderOrder).to.equal(-5)
		expect(
			converter.createMesh({ isVisible: true, geometry: box(), depthBias: 2.4 } as any).renderOrder,
			'fractional bias rounds',
		).to.equal(-2)
		expect(
			converter.createMesh({ isVisible: true, geometry: box(), depthBias: -20 } as any).renderOrder,
			'upper clamp',
		).to.equal(15)
		expect(
			converter.createMesh({ isVisible: true, geometry: box(), depthBias: 20000 } as any).renderOrder,
			'DMD lower clamp',
		).to.equal(-10000)
		expect(
			converter.createMesh({ isVisible: true, geometry: box(), depthBias: 0 } as any).renderOrder,
			'zero bias leaves the default',
		).to.equal(0)
		expect(
			converter.createMesh({ isVisible: true, geometry: box(), depthBias: 5, material: { name: 'ball' } } as any)
				.renderOrder,
			'ball wins over bias',
		).to.equal(1)
	})

	it('overrides depthWrite from RenderInfo and leaves it alone when unset', () => {
		const converter = makeConverter()
		const off = converter.createMesh({ isVisible: true, geometry: box(), depthWrite: false } as any)
		expect((off.material as THREE.MeshStandardMaterial).depthWrite).to.equal(false)
		const untouched = converter.createMesh({ isVisible: true, geometry: box() } as any)
		expect((untouched.material as THREE.MeshStandardMaterial).depthWrite).to.equal(true)
	})

	it('keys cached materials by depthWrite instead of sharing one across flags', () => {
		const mapGenerator = { hasTexture: () => false, getTexture: () => null }
		const materialGenerator = new ThreeNodeMaterialGenerator(mapGenerator as any)
		const converter = new ThreeConverter(new ThreeMeshGenerator(), materialGenerator, {})
		const tri = Mesh.fromArray(
			[
				[0, 0, 0, 0, 0, 1, 0, 0],
				[1, 0, 0, 0, 0, 1, 1, 0],
				[0, 1, 0, 0, 0, 1, 0, 1],
			],
			[0, 1, 2],
		)
		// Identical file-level inputs: without depthWrite in the cache key both
		// meshes share one material and the second write clobbers the first.
		const off = converter.createMesh({ isVisible: true, mesh: tri, depthWrite: false } as any)
		const on = converter.createMesh({ isVisible: true, mesh: tri, depthWrite: true } as any)
		expect((off.material as THREE.MeshStandardMaterial).depthWrite).to.equal(false)
		expect((on.material as THREE.MeshStandardMaterial).depthWrite).to.equal(true)
		expect(off.material).to.not.equal(on.material)
	})

	it('throws when neither mesh nor geometry is provided', () => {
		const converter = makeConverter()
		expect(() => converter.createMesh({ isVisible: true } as any)).to.throw(
			'Mesh export must either provide mesh or geometry.',
		)
	})
})
