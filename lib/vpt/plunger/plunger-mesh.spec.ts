// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'

import { ThreeHelper } from '../../../test/three.helper'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { Table } from '../table/table.js'
import { TableExporter } from '../table/table-exporter.js'

const three = new ThreeHelper()

describe('The VPinball plunger generator', () => {
	let gltf: GLTF

	before(async () => {
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-plunger.vpx')))
		const exporter = new TableExporter(table)
		gltf = await three.loadGlb(await exporter.exportGlb({ exportPlayfieldLights: true }))
	})

	it('should generate a flat plunger', async () => {
		three.expectObject(gltf, 'plungers', 'FlatPlunger', 'flat')
	})

	it('should generate a modern plunger', async () => {
		three.expectObject(gltf, 'plungers', 'ModernPlunger', 'spring')
		three.expectObject(gltf, 'plungers', 'ModernPlunger', 'rod')
	})

	it('should generate a custom plunger', async () => {
		three.expectObject(gltf, 'plungers', 'CustomPlunger', 'spring')
		three.expectObject(gltf, 'plungers', 'CustomPlunger', 'rod')
	})
})
