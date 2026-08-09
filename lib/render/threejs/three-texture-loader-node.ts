// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Buffer } from 'node:buffer'
import { promises as fsPromises } from 'node:fs'
import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import {
	DataTexture,
	FloatType,
	HalfFloatType,
	RGBAFormat,
	SRGBColorSpace,
	type Texture as ThreeTexture,
} from '../../refs.node.js'
import { logger } from '../../util/logger.js'
import type { ITextureLoader } from '../irender-api.js'

export class ThreeTextureLoaderNode implements ITextureLoader<ThreeTexture> {
	async loadTexture(name: string, ext: string, data: Uint8Array): Promise<ThreeTexture> {
		try {
			return await loadSharpImage(name, (sharp as any)(Buffer.from(data.buffer, data.byteOffset, data.byteLength)))
		} catch (err) {
			logger().warn('[Texture] failed to load %s: %s', name, (err as Error).message)
			if (ext === '.hdr') return loadHdrImage(name, data)
			if (ext === '.exr') return loadExrImage(name, data)
			throw err
		}
	}

	async loadRawTexture(name: string, data: Uint8Array, width: number, height: number): Promise<ThreeTexture> {
		const tex = new DataTexture(data, width, height, RGBAFormat)
		tex.flipY = false
		tex.colorSpace = SRGBColorSpace
		tex.needsUpdate = true
		tex.name = `texture:${name}`
		return tex as unknown as ThreeTexture
	}

	async loadDefaultTexture(name: string, _ext: string, fileName: string): Promise<ThreeTexture> {
		const filePath = resolvePath(__dirname, '../../../res/maps', fileName)
		return this.loadTexture(name, 'png', Uint8Array.from(Buffer.from(await fsPromises.readFile(filePath, null) as unknown as string, 'binary')))
	}
}

async function loadSharpImage(name: string, shrp: any): Promise<ThreeTexture> {
	const { data, info } = await shrp.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
	const tex = new DataTexture(
		new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
		info.width,
		info.height,
		RGBAFormat,
	)
	tex.flipY = false
	tex.colorSpace = SRGBColorSpace
	tex.needsUpdate = true
	tex.name = `texture:${name}`
	return tex as unknown as ThreeTexture
}

function loadHdrImage(_name: string, data: Uint8Array): Promise<ThreeTexture> {
	return new Promise((resolve, reject) => {
		new HDRLoader()
			.setDataType(HalfFloatType as never)
			.load(
				data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as never,
				tex => resolve(tex as ThreeTexture),
				undefined,
				reject,
			)
	})
}

function loadExrImage(_name: string, data: Uint8Array): Promise<ThreeTexture> {
	return new Promise((resolve, reject) => {
		new EXRLoader()
			.setDataType(FloatType as never)
			.load(
				data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as never,
				tex => resolve(tex as ThreeTexture),
				undefined,
				reject,
			)
	})
}
