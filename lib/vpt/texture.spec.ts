// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
// biome-ignore-all lint/style/noNonNullAssertion: test fixtures guarantee texture exists

import { expect } from 'chai'
import { NodeBinaryReader } from '../../lib/io/binary-reader.node.js'
import { ThreeTextureLoaderNode } from '../../lib/render/threejs/three-texture-loader-node.js'
import { Table } from '../../lib/vpt/table/table.js'
import { ThreeHelper } from '../../test/three.helper'

const three = new ThreeHelper()

describe('The VPinball texture parser', () => {
	let vpt: Table
	const loader = new ThreeTextureLoaderNode()

	before(async () => {
		vpt = await Table.load(new NodeBinaryReader(three.fixturePath('table-texture.vpx')))
	})

	it('should correctly export a png', async () => {
		const tex = await vpt.getTexture('test_pattern_transparent')!.loadTexture(loader, vpt)
		expect((tex as any).image).to.exist
		expect((tex as any).name).to.match(/test_pattern_transparent/i)
	})

	it('should convert an opaque png to jpeg', async () => {
		const tex = await vpt.getTexture('test_pattern_png')!.loadTexture(loader, vpt)
		expect((tex as any).image).to.exist
	})

	it('should correctly export a jpeg', async () => {
		const tex = await vpt.getTexture('test_pattern_jpg')!.loadTexture(loader, vpt)
		expect((tex as any).image).to.exist
	})

	it('should correctly export an lzw-compressed bitmap', async () => {
		const tex = await vpt.getTexture('test_pattern_xrgb')!.loadTexture(loader, vpt)
		expect((tex as any).image).to.exist
	})

	it('should correctly export an lzw-compressed xrgba bitmap', async () => {
		const tex = await vpt.getTexture('test_pattern_argb')!.loadTexture(loader, vpt)
		expect((tex as any).image).to.exist
	})

	it('should resize an image to power of two', async () => {
		const tex = await vpt.getTexture('test_pattern_png')!.loadTexture(loader, vpt)
		expect((tex as any).image).to.exist
	})

	it('should correctly export a HDR environment map', async () => {
		const tex = await vpt.getTexture('test_pattern_hdr')!.loadTexture(loader, vpt)
		expect((tex as any).image.width).to.equal(1024)
		expect((tex as any).image.height).to.equal(512)
		expect((tex as any).image.data.length).to.equal(2097152)
	})

	it('should correctly export a EXR environment map', async () => {
		const tex = await vpt.getTexture('test_pattern_exr')!.loadTexture(loader, vpt)
		expect((tex as any).image.width).to.equal(587)
		expect((tex as any).image.height).to.equal(675)
		expect((tex as any).image.data.length).to.equal(1584900)
	})

	it('should correctly export a local texture', async () => {
		const tex = await vpt.kickers.Kicker1.getMeshes(vpt).kicker.map!.loadTexture(loader, vpt)
		expect((tex as any).image).to.exist
		expect((tex as any).name).to.match(/kicker/i)
	})
})
