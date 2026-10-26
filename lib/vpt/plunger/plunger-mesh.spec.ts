// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { ThreeHelper } from '../../../test/three.helper'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { Table } from '../table/table.js'
import { TableExporter } from '../table/table-exporter.js'
import type { PlungerData } from './plunger-data.js'
import { PlungerDesc } from './plunger-desc.js'

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

describe('The VPinball custom plunger tip parser', () => {
	let data: PlungerData

	before(async () => {
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-plunger.vpx')))
		data = table.plungers.CustomPlunger.data
	})

	function customDesc(tipShape: string): PlungerDesc {
		data.szTipShape = tipShape
		return PlungerDesc.getCustom(data, 100, 2.2).desc
	}

	function expectFiniteCoords(desc: PlungerDesc): void {
		for (const coord of desc.c) {
			expect(coord.y, 'y').to.be.finite
			expect(coord.r, 'r').to.be.finite
			expect(coord.tv, 'tv').to.be.finite
			expect(coord.nx, 'nx').to.be.finite
			expect(coord.ny, 'ny').to.be.finite
		}
	}

	it('should read comma-style tip shapes as zero, like upstream', () => {
		const desc = customDesc('0,.34; 2,.6')
		expect(desc.c[0]!.y).to.equal(0)
		expect(desc.c[0]!.r).to.equal(0)
		expect(desc.c[1]!.y).to.equal(2)
		expect(desc.c[1]!.r).to.equal(0)
		expect(desc.c[1]!.tv).to.be.closeTo(0.24, 1e-6)
		expectFiniteCoords(desc)
	})

	it('should keep fractional y offsets', () => {
		const desc = customDesc('0.5 .34; 2.7 .6')
		expect(desc.c[0]!.y).to.be.closeTo(0.5, 1e-6)
		expect(desc.c[1]!.y).to.be.closeTo(2.7, 1e-6)
		expect(desc.c[0]!.r).to.be.closeTo(0.17, 1e-6)
		expect(desc.c[1]!.r).to.be.closeTo(0.3, 1e-6)
		expectFiniteCoords(desc)
	})

	it('should not produce NaN texture coordinates for all-zero tips', () => {
		const desc = customDesc('0 0; 0 0')
		expect(desc.c[0]!.tv).to.equal(0)
		expect(desc.c[1]!.tv).to.equal(0)
		expectFiniteCoords(desc)
	})

	it('should tolerate irregular whitespace between values', () => {
		const desc = customDesc('0  .34;\t2\t.6')
		expect(desc.c[0]!.y).to.equal(0)
		expect(desc.c[0]!.r).to.be.closeTo(0.17, 1e-6)
		expect(desc.c[1]!.y).to.equal(2)
		expect(desc.c[1]!.r).to.be.closeTo(0.3, 1e-6)
		expectFiniteCoords(desc)
	})

	it('should read blank entries as zero', () => {
		const desc = customDesc('0 .34;')
		expect(desc.c[0]!.y).to.equal(0)
		expect(desc.c[0]!.r).to.be.closeTo(0.17, 1e-6)
		expect(desc.c[1]!.y).to.equal(0)
		expect(desc.c[1]!.r).to.equal(0)
		expectFiniteCoords(desc)
	})

	it('should not throw for an empty tip shape', () => {
		expect(() => customDesc('')).to.not.throw()
		expectFiniteCoords(customDesc(''))
	})
})
