// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { readFileSync, writeFileSync } from 'node:fs'
import { expect } from 'chai'
import looksSame, { createDiff } from 'looks-same'
import sharp from 'sharp'
import { NodeBinaryReader } from '../../lib/io/binary-reader.node.js'
import { ThreeTextureLoaderNode } from '../../lib/render/threejs/three-texture-loader-node.js'
import { Table } from '../../lib/vpt/table/table.js'
import { ThreeHelper } from '../../test/three.helper'

const three = new ThreeHelper()
const imgDiffTolerance = 7

describe('The VPinball texture parser', () => {
	let vpt: Table
	const loader = new ThreeTextureLoaderNode()
	const testPng = readFileSync(three.fixturePath('test_pattern.png'))
	const testPngPow2 = readFileSync(three.fixturePath('test_pattern_pow2.png'))
	const testPngTransparent = readFileSync(three.fixturePath('test_pattern_transparent.png'))
	const testPngOptimized = readFileSync(three.fixturePath('test_pattern_optimized.png'))
	const testLocalGottliebKicker = readFileSync(three.resPath('kickerGottlieb.png'))

	before(async () => {
		vpt = await Table.load(new NodeBinaryReader(three.fixturePath('table-texture.vpx')))
	})

	it('should correctly export a png', async () => {
		const texture = vpt.getTexture('test_pattern_transparent')!
		const threeTexture = await texture.loadTexture(loader, vpt)
		const png = await threeTexture.image.getImage(false)
		const match = await comparePngs(png, testPngTransparent, 10, true)
		expect(match).to.equal(true)
	})

	it('should convert an opaque png to jpeg', async () => {
		const texture = vpt.getTexture('test_pattern_png')!
		const threeTexture = await texture.loadTexture(loader, vpt)
		const jpg = await threeTexture.image.getImage(false, 100)
		const png = await sharp(jpg).png().toBuffer()
		const match = await comparePngs(png, testPng, 30)
		expect(match).to.equal(true)
	})

	it('should correctly export a jpeg', async () => {
		const texture = vpt.getTexture('test_pattern_jpg')!
		const threeTexture = await texture.loadTexture(loader, vpt)
		const jpg = await threeTexture.image.getImage(false, 100)
		const png = await sharp(jpg).png().toBuffer()
		const match = await comparePngs(png, testPng, 30)
		expect(match).to.equal(true)
	})

	it('should correctly export an lzw-compressed bitmap', async () => {
		const texture = vpt.getTexture('test_pattern_xrgb')!
		const threeTexture = await texture.loadTexture(loader, vpt)
		const jpg = await threeTexture.image.getImage(false, 100)
		const png = await sharp(jpg).png().toBuffer()
		const match = await comparePngs(png, testPng, 30)
		expect(match).to.equal(true)
	})

	it('should correctly export an lzw-compressed xrgba bitmap', async () => {
		const texture = vpt.getTexture('test_pattern_argb')!
		const threeTexture = await texture.loadTexture(loader, vpt)
		const jpg = await threeTexture.image.getImage(false, 100)
		const png = await sharp(jpg).png().toBuffer()
		const match = await comparePngs(png, testPng, 30)
		expect(match).to.equal(true)
	})

	it('should resize an image to power of two', async () => {
		const texture = vpt.getTexture('test_pattern_png')!
		const threeTexture = await texture.loadTexture(loader, vpt)
		threeTexture.image.resize(1024, 512)
		const jpg = await threeTexture.image.getImage(false, 100)
		const png = await sharp(jpg).png().toBuffer()
		const match = await comparePngs(png, testPngPow2, 50)
		expect(match).to.equal(true)
	})

	it('should optimize a png', async () => {
		const texture = vpt.getTexture('test_pattern_transparent')!
		const threeTexture = await texture.loadTexture(loader, vpt)
		try {
			const png = await threeTexture.image.getImage(true)
			const _match = await comparePngs(png, testPngOptimized, 30, true)
		} catch (err: any) {
			if (err.message?.includes('PngQuant')) {
				console.warn('Skipping pngquant test - binary not available:', err.message)
				return
			}
			throw err
		}
		//expect(match).to.equal(true); fuck you pngcrush
	})

	it('should correctly export a HDR environment map', async () => {
		const texture = vpt.getTexture('test_pattern_hdr')!
		const threeTexture = await texture.loadTexture(loader, vpt)
		expect(threeTexture.image.width).to.equal(1024)
		expect(threeTexture.image.height).to.equal(512)
		expect(threeTexture.image.data.length).to.equal(2097152)
	})

	it('should correctly export a EXR environment map', async () => {
		const texture = vpt.getTexture('test_pattern_exr')!
		const threeTexture = await texture.loadTexture(loader, vpt)
		expect(threeTexture.image.width).to.equal(587)
		expect(threeTexture.image.height).to.equal(675)
		expect(threeTexture.image.data.length).to.equal(1584900)
	})

	it('should correctly export a local texture', async () => {
		const kicker = vpt.kickers.Kicker1
		const kickerMeshes = kicker.getMeshes(vpt)
		const threeTexture = await kickerMeshes.kicker.map?.loadTexture(loader, vpt)
		expect(threeTexture.image.width).to.equal(256)
		expect(threeTexture.image.height).to.equal(256)

		const jpg = await threeTexture.image.getImage(false, 100)
		const png = await sharp(jpg).png().toBuffer()
		const match = await comparePngs(png, testLocalGottliebKicker, 30)
		expect(match).to.equal(true)
	})
})

async function comparePngs(
	img1: Buffer,
	img2: Buffer,
	tolerance = imgDiffTolerance,
	ignoreAntialiasing = false,
	debugPrint = false,
): Promise<boolean> {
	return new Promise<any>((resolve, reject) => {
		looksSame(img1, img2, { tolerance, ignoreAntialiasing, ignoreCaret: false }, (error, result) => {
			if (error) {
				return reject(error)
			}
			if (debugPrint) {
				console.log(JSON.stringify(result, null, '  '))
			}
			resolve(result.equal)
		})
	})
}

async function _debug(img1: Buffer, img2: Buffer, tolerance = imgDiffTolerance, ignoreAntialiasing = false) {
	await comparePngs(img1, img2, tolerance, ignoreAntialiasing, true)
	await new Promise<void>((resolve, reject) => {
		createDiff(
			{
				reference: img1,
				current: img2,
				diff: 'diff.png',
				highlightColor: '#ff00ff', // color to highlight the differences
				strict: false,
				tolerance,
				antialiasingTolerance: 0,
				ignoreAntialiasing,
				ignoreCaret: false,
			},
			(error) => (error ? reject(error) : resolve()),
		)
	})
	writeFileSync('texture.png', img1)
	writeFileSync('fixture.png', img2)
}
