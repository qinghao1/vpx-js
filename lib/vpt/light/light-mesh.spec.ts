// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { ThreeHelper } from '../../../test/three.helper'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { Table } from '../table/table.js'
import { TableExporter } from '../table/table-exporter.js'

const three = new ThreeHelper()

describe('The VPinball lights generator', () => {
	let gltf: GLTF

	before(async () => {
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-light.vpx')))
		const exporter = new TableExporter(table)
		gltf = await three.loadGlb(await exporter.exportGlb({ exportPlayfieldLights: true }))
	})

	it('should generate a static light bulb mesh', async () => {
		three.expectObject(gltf, 'lightBulbs', 'StaticBulb', 'bulblight')
	})

	it('should generate a light bulb mesh', async () => {
		three.expectObject(gltf, 'lightBulbs', 'Bulb', 'bulblight')
	})

	it('should generate a scaled light bulb mesh', async () => {
		// TODO find a way to test scaling (vpx obj export doesn't export light bulbs)
		three.expectObject(gltf, 'lightBulbs', 'Scaled', 'bulblight')
	})

	it('should generate a light bulb mesh on a surface', async () => {
		// TODO find a way to test (vpx obj export doesn't export light bulbs)
		three.expectObject(gltf, 'lightBulbs', 'Surface', 'bulblight')
	})

	it('should not generate a light bulb with no bulb mesh', async () => {
		three.expectNoObject(gltf, 'lightBulbs', 'NoBulb')
	})

	it('should not generate a light with no bulb mesh', async () => {
		three.expectNoObject(gltf, 'lightBulbs', 'lightNoBulb')
	})

	it('should generate a glow quad instead of a scene light', async () => {
		// Polygon lights render through the native lightmap pass, never as scene
		// lights, so the export carries a `bulb.glow` mesh and no punctual light.
		three.expectObject(gltf, 'lightBulbs', 'StaticBulb', 'bulbglow')
		three.expectNoObject(gltf, 'lightBulbs', 'StaticBulb', 'light')
	})

	it('should generate a glow quad for custom parameters', async () => {
		three.expectObject(gltf, 'lightBulbs', 'CustomParams', 'bulbglow')
		three.expectNoObject(gltf, 'lightBulbs', 'CustomParams', 'light')
	})

	it('should generate a mesh for a light with the same texture as the playfield', async () => {
		three.expectObject(gltf, 'playfieldLights', 'PlayfieldLight', 'surfacelight')
	})

	it('should generate a mesh for a light with the same texture as a surface', async () => {
		three.expectObject(gltf, 'playfieldLights', 'SurfaceLight', 'surfacelight')
	})

	it('should generate a mesh for a light that has the same texture as three other lights', async () => {
		three.expectObject(gltf, 'playfieldLights', 'SurfaceLightCollection', 'surfacelight')
	})
})
