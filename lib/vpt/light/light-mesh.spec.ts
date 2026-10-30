// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Object3D } from 'three'
import { ThreeHelper } from '../../../test/three.helper'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { ThreeRenderApi } from '../../render/threejs/three-render-api.js'
import { Table } from '../table/table.js'

const three = new ThreeHelper()

describe('The VPinball lights generator', () => {
	let node: Object3D

	before(async () => {
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-light.vpx')))
		node = await table.generateTableNode(new ThreeRenderApi(), { exportPlayfieldLights: true })
	})

	it('should generate a static light bulb mesh', async () => {
		three.expectObject(node, 'lightBulbs', 'StaticBulb', 'bulblight')
	})

	it('should generate a light bulb mesh', async () => {
		three.expectObject(node, 'lightBulbs', 'Bulb', 'bulblight')
	})

	it('should generate a scaled light bulb mesh', async () => {
		// TODO find a way to test scaling (vpx obj export doesn't export light bulbs)
		three.expectObject(node, 'lightBulbs', 'Scaled', 'bulblight')
	})

	it('should generate a light bulb mesh on a surface', async () => {
		// TODO find a way to test (vpx obj export doesn't export light bulbs)
		three.expectObject(node, 'lightBulbs', 'Surface', 'bulblight')
	})

	it('should not generate a light bulb with no bulb mesh', async () => {
		three.expectNoObject(node, 'lightBulbs', 'NoBulb')
	})

	it('should generate a glow quad instead of a scene light', async () => {
		// Polygon lights render through the native lightmap pass, never as scene
		// lights, so the export carries a `bulb.glow` mesh and no punctual light.
		three.expectObject(node, 'lightBulbs', 'StaticBulb', 'bulbglow')
		three.expectNoObject(node, 'lightBulbs', 'StaticBulb', 'light')
	})

	it('should generate a glow quad for custom parameters', async () => {
		three.expectObject(node, 'lightBulbs', 'CustomParams', 'bulbglow')
		three.expectNoObject(node, 'lightBulbs', 'CustomParams', 'light')
	})

	it('should generate a mesh for a light with the same texture as the playfield', async () => {
		three.expectObject(node, 'playfieldLights', 'PlayfieldLight', 'surfacelight')
	})

	it('should generate a mesh for a light with the same texture as a surface', async () => {
		three.expectObject(node, 'playfieldLights', 'SurfaceLight', 'surfacelight')
	})

	it('should generate a mesh for a light that has the same texture as three other lights', async () => {
		three.expectObject(node, 'playfieldLights', 'SurfaceLightCollection', 'surfacelight')
	})
})
