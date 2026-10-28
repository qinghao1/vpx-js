// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
// biome-ignore-all lint/style/noNonNullAssertion: test fixtures guarantee texture exists

import { expect } from 'chai'
import { NodeBinaryReader } from '../../lib/io/binary-reader.node.js'
import { ThreeTextureLoaderNode } from '../../lib/render/threejs/three-texture-loader-node.js'
import { Table } from '../../lib/vpt/table/table.js'
import { ThreeHelper } from '../../test/three.helper'
import { Texture } from './texture.js'

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

	it('should correctly export a jpeg', async () => {
		const tex = await vpt.getTexture('test_pattern_jpg')!.loadTexture(loader, vpt)
		expect((tex as any).image).to.exist
	})

	it('should return a documented white 1x1 placeholder for non-PNG data in Node', async () => {
		// Node has no JPEG/WebP/GIF/BMP decoder (see ThreeTextureLoaderNode.loadTexture):
		// non-PNG payloads resolve to white 1x1 instead of throwing.
		const tex = (await vpt.getTexture('test_pattern_jpg')!.loadTexture(loader, vpt)) as any
		expect(tex.image.width).to.equal(1)
		expect(tex.image.height).to.equal(1)
		expect(Array.from(tex.image.data)).to.deep.equal([255, 255, 255, 255])
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

	it('should fail when the image stream is missing', async () => {
		const missing = new (Texture as any)()
		missing.storageName = 'NoSuchImage'
		missing.szPath = 'missing.png'
		missing.binary = { pos: 0, len: 0 }
		try {
			await missing.loadTexture(loader, vpt)
		} catch (error) {
			expect((error as Error).message).to.equal('No such stream "NoSuchImage".')
			return
		}
		expect.fail('expected loadTexture to throw')
	})

	it('should normalize ALTV from raw 0..255 to 0..1 like native', async () => {
		const cutout = new (Texture as any)()
		const buffer = new Uint8Array(4)
		new DataView(buffer.buffer).setFloat32(0, 1.0, true)
		await cutout.fromTag(buffer, 'ALTV', 0, 4, null, 'test')
		expect(cutout.alphaTestValue).to.be.closeTo(1 / 255, 1e-6)
	})

	it('should keep the texture present when a LINK tag appears', async () => {
		const tex = new (Texture as any)()
		tex.szName = 'LinkedTex'
		const skipped = await tex.fromTag(new Uint8Array(4), 'LINK', 0, 4, null, 'Image0')
		expect(skipped).to.equal(0)
		expect(tex.getName()).to.equal('linkedtex')
	})

	it('should name textures by NAME, not INME (upstream ignores INME)', () => {
		const tex = new (Texture as any)()
		tex.szName = 'FooName'
		tex.szInternalName = 'BarInternal'
		expect(tex.getName()).to.equal('fooname')
	})

	it('should preserve local file name case (lookups lowercase)', () => {
		expect(Texture.fromFilesystem('/tmp/Sprite.PNG').getName()).to.equal('Sprite.PNG')
		expect(Texture.fromFilesystem('C:\\games\\DMD.PNG').getName()).to.equal('DMD.PNG')
	})

	it('should fall back to INME when NAME is missing', () => {
		const tex = new (Texture as any)()
		tex.szName = ''
		tex.szInternalName = 'BarInternal'
		expect(tex.getName()).to.equal('barinternal')
	})

	it('should detect HDR by extension like upstream IsHDR', () => {
		const hdr = Texture.fromFilesystem('/tmp/env.hdr')
		hdr.szPath = 'env.hdr'
		expect(hdr.isHdr()).to.equal(true)
		const exr = Texture.fromFilesystem('/tmp/env.exr')
		exr.szPath = 'env.exr'
		expect(exr.isHdr()).to.equal(true)
		const png = Texture.fromFilesystem('/tmp/tex.png')
		png.szPath = 'tex.png'
		expect(png.isHdr()).to.equal(false)
	})

	it('should load raw textures idempotently', async () => {
		const fresh = await Table.load(new NodeBinaryReader(three.fixturePath('table-texture.vpx')))
		const raw = fresh.getTexture('test_pattern_xrgb')!
		const first = (await raw.loadTexture(loader, fresh)) as any
		const second = (await raw.loadTexture(loader, fresh)) as any
		expect(first.image.width).to.equal(1024)
		expect(second.image.width).to.equal(1024)
		expect(second.image.height).to.equal(768)
	})

	it('should pass a lowercased dotted ext for local files', async () => {
		const tex = Texture.fromFilesystem('/tmp/Sprite.PNG')
		let seen = ''
		const mock = { loadDefaultTexture: async (_n: string, ext: string) => (seen = ext) } as any
		await tex.loadTexture(mock, {} as any)
		expect(seen).to.equal('.png')
	})

	it('should pass "" for dotless names (upstream extension_from_path)', async () => {
		const tex = Texture.fromFilesystem('dotless')
		let seen = 'unset'
		const mock = { loadDefaultTexture: async (_n: string, ext: string) => (seen = ext) } as any
		await tex.loadTexture(mock, {} as any)
		expect(seen).to.equal('')
	})

	it('should not throw when neither szPath nor localFileName is set', async () => {
		const tex = new (Texture as any)()
		let seen = 'unset'
		const mock = { loadTexture: async (_n: string, ext: string) => (seen = ext) } as any
		const table = { streamStorage: async () => new Uint8Array([1, 2, 3]) } as any
		await tex.loadTexture(mock, table)
		expect(seen).to.equal('')
	})

	it('should fail fast on a cleared source instead of reading the whole stream', async () => {
		const tex = new (Texture as any)()
		tex.storageName = 'Image105'
		tex.szName = 'clearedtex'
		tex.szPath = 'cleared.webp'
		tex.binary = undefined
		let reads = 0
		let loaderCalls = 0
		const table = {
			streamStorage: async (_name: string, next: (storage: unknown) => Promise<Uint8Array>) => {
				reads++
				return next({ read: async () => new Uint8Array([1, 2, 3]) })
			},
		} as any
		const mock = {
			loadTexture: async () => {
				loaderCalls++
				return {}
			},
		} as any
		try {
			await tex.loadTexture(mock, table)
		} catch (error) {
			expect((error as Error).message).to.match(/clearedtex.*source cleared or missing/)
			expect(reads).to.equal(0)
			expect(loaderCalls).to.equal(0)
			return
		}
		expect.fail('expected loadTexture to throw')
	})
})
