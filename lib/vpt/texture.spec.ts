// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
// biome-ignore-all lint/style/noNonNullAssertion: test fixtures guarantee texture exists

import { readFileSync } from 'node:fs'
import { expect } from 'chai'
import looksSame from 'looks-same'
import sharp from 'sharp'
import { NodeBinaryReader } from '../../lib/io/binary-reader.node.js'
import { ThreeTextureLoaderNode } from '../../lib/render/threejs/three-texture-loader-node.js'
import { Table } from '../../lib/vpt/table/table.js'
import { ThreeHelper } from '../../test/three.helper'

const three = new ThreeHelper()

describe('The VPinball texture parser', () => {
	let vpt: Table
	const loader = new ThreeTextureLoaderNode()
	const testPng = readFileSync(three.fixturePath('test_pattern.png'))
	const testPngPow2 = readFileSync(three.fixturePath('test_pattern_pow2.png'))
	const testPngTransparent = readFileSync(three.fixturePath('test_pattern_transparent.png'))
	const testLocalGottliebKicker = readFileSync(three.resPath('kickerGottlieb.png'))

	before(async () => {
		vpt = await Table.load(new NodeBinaryReader(three.fixturePath('table-texture.vpx')))
	})

	async function encode(tex: any, format: 'png' | 'jpeg' = 'png', quality = 100): Promise<Buffer> {
		const { data, width, height } = tex.image
		const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength)
		const pipe = sharp(buf, { raw: { width, height, channels: 4 } })
		return format === 'jpeg' ? pipe.jpeg({ quality }).toBuffer() : pipe.png().toBuffer()
	}

	it('should correctly export a png', async () => {
		const tex = await vpt.getTexture('test_pattern_transparent')!.loadTexture(loader, vpt)
		expect(await comparePngs(await encode(tex), testPngTransparent, 10, true)).to.equal(true)
	})

	it('should convert an opaque png to jpeg', async () => {
		const tex = await vpt.getTexture('test_pattern_png')!.loadTexture(loader, vpt)
		const png = await sharp(await encode(tex, 'jpeg', 100))
			.png()
			.toBuffer()
		expect(await comparePngs(png, testPng, 30)).to.equal(true)
	})

	it('should correctly export a jpeg', async () => {
		const tex = await vpt.getTexture('test_pattern_jpg')!.loadTexture(loader, vpt)
		const png = await sharp(await encode(tex, 'jpeg', 100))
			.png()
			.toBuffer()
		expect(await comparePngs(png, testPng, 30)).to.equal(true)
	})

	it('should correctly export an lzw-compressed bitmap', async () => {
		const tex = await vpt.getTexture('test_pattern_xrgb')!.loadTexture(loader, vpt)
		const png = await sharp(await encode(tex, 'jpeg', 100))
			.png()
			.toBuffer()
		expect(await comparePngs(png, testPng, 30)).to.equal(true)
	})

	it('should correctly export an lzw-compressed xrgba bitmap', async () => {
		const tex = await vpt.getTexture('test_pattern_argb')!.loadTexture(loader, vpt)
		const png = await sharp(await encode(tex, 'jpeg', 100))
			.png()
			.toBuffer()
		expect(await comparePngs(png, testPng, 30)).to.equal(true)
	})

	it('should resize an image to power of two', async () => {
		const tex = await vpt.getTexture('test_pattern_png')!.loadTexture(loader, vpt)
		const { data, width, height } = (tex as any).image
		const jpg = await sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
			raw: { width, height, channels: 4 },
		})
			.resize(1024, 512, { fit: 'fill' })
			.jpeg({ quality: 100 })
			.toBuffer()
		expect(await comparePngs(await sharp(jpg).png().toBuffer(), testPngPow2, 50)).to.equal(true)
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
		expect((tex as any).image.width).to.equal(256)
		expect((tex as any).image.height).to.equal(256)
		const png = await sharp(await encode(tex, 'jpeg', 100))
			.png()
			.toBuffer()
		expect(await comparePngs(png, testLocalGottliebKicker, 30)).to.equal(true)
	})
})

function comparePngs(img1: Buffer, img2: Buffer, tolerance = 7, ignoreAntialiasing = false): Promise<boolean> {
	return new Promise((resolve, reject) => {
		looksSame(img1, img2, { tolerance, ignoreAntialiasing, ignoreCaret: false }, (err, result) =>
			err ? reject(err as Error) : resolve((result as { equal: boolean }).equal),
		)
	})
}
