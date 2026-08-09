// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Buffer } from 'node:buffer'
import { createReadStream } from 'node:fs'
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

/** ThreeTextureLoaderNode. */
export class ThreeTextureLoaderNode implements ITextureLoader<ThreeTexture> {
	public async loadTexture(name: string, ext: string, data: Uint8Array): Promise<ThreeTexture> {
		try {
			return await loadSharpImage(
				name,
				(sharp as any)(Buffer.from(data.buffer, data.byteOffset, data.byteLength) as any),
			)
		} catch (err) {
			logger().warn(
				'[Image.init] Could not read metadata from buffer (%s), using GM to read image.',
				(err as Error).message,
			)

			if (ext === '.hdr') {
				return await loadHdrImage(name, data)
			} else if (ext === '.exr') {
				return await loadExrImage(name, data)
			} else {
				throw err
			}
		}
	}

	public async loadRawTexture(name: string, data: Uint8Array, width: number, height: number): Promise<ThreeTexture> {
		const tex = new DataTexture(data as unknown as Uint8Array, width, height, RGBAFormat)
		tex.flipY = false
		tex.colorSpace = SRGBColorSpace
		tex.needsUpdate = true
		tex.name = `texture:${name}`
		return tex as unknown as ThreeTexture
	}

	public async loadDefaultTexture(name: string, ext: string, fileName: string): Promise<ThreeTexture> {
		const filePath = resolvePath(__dirname, '../../..', 'res', 'maps', fileName)
		return this.loadTexture(name, ext, await stream(filePath))
	}
}

async function stream(localPath: string): Promise<Uint8Array> {
	const readStream = createReadStream(localPath)
	return new Promise<Uint8Array>((resolve, reject) => {
		const buffers: Uint8Array[] = []
		/* istanbul ignore if */
		if (!readStream) {
			return reject(new Error(`No such stream "${localPath}".`))
		}
		readStream.on('error', reject)
		readStream.on('data', (buf: Buffer) => buffers.push(buf))
		readStream.on('end', () => resolve(Buffer.concat(buffers)))
	})
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

async function loadHdrImage(_name: string, data: Uint8Array): Promise<ThreeTexture> {
	return new Promise((resolve, reject) => {
		new HDRLoader().setDataType(HalfFloatType as any).load(
			data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as any,
			(texture: ThreeTexture) => resolve(texture),
			undefined,
			(err: any) => reject(err),
		)
	})
}

async function loadExrImage(_name: string, data: Uint8Array): Promise<ThreeTexture> {
	return new Promise((resolve, reject) => {
		new EXRLoader().setDataType(FloatType).load(
			data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as any,
			(texture: ThreeTexture) => resolve(texture),
			undefined,
			(err: any) => reject(err),
		)
	})
}
