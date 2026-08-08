// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Buffer } from 'node:buffer'
import { createReadStream } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import sharp from 'sharp'
import { NodeImage } from '../../gltf/image.node.js'
import {
	DataTexture,
	FloatType,
	HalfFloatType,
	LinearSRGBColorSpace,
	RGBAFormat,
	SRGBColorSpace,
	Texture as ThreeTexture,
	UnsignedByteType,
} from '../../refs.node.js'
import { logger } from '../../util/logger.js'
import type { ITextureLoader } from '../irender-api.js'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'

/** ThreeTextureLoaderNode. */
export class ThreeTextureLoaderNode implements ITextureLoader<ThreeTexture> {
	public async loadTexture(name: string, ext: string, data: Uint8Array): Promise<ThreeTexture> {
		try {
			return await loadSharpImage(
				name,
				(sharp as any)(Buffer.from(data.buffer, data.byteOffset, data.byteLength) as any),
			)
		} catch (err) {
			logger().warn('[Image.init] Could not read metadata from buffer (%s), using GM to read image.', err.message)

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
		return loadSharpImage(
			name,
			(sharp as any)(Buffer.from(data.buffer, data.byteOffset, data.byteLength) as any, {
				raw: {
					width,
					height,
					channels: 4,
				},
			}).png(),
		)
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
			return reject(new Error('No such stream "' + localPath + '".'))
		}
		readStream.on('error', reject)
		readStream.on('data', (buf: Buffer) => buffers.push(buf))
		readStream.on('end', () => resolve(Buffer.concat(buffers)))
	})
}

async function loadSharpImage(name: string, shrp: any): Promise<ThreeTexture> {
	const stats = await shrp.stats()
	const metadata = await shrp.metadata()
	const image = new NodeImage(name, metadata.width!, metadata.height!, metadata.format!, stats, shrp)

	const texture = new ThreeTexture()
	texture.name = `texture:${name}`
	texture.image = image
	return texture
}

async function loadHdrImage(name: string, data: Uint8Array): Promise<ThreeTexture> {
	return new Promise((resolve, reject) => {
		new RGBELoader().setDataType(HalfFloatType as any).load(
			data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as any,
			(texture: ThreeTexture) => resolve(texture),
			undefined,
			(err: any) => reject(err),
		)
	})
}

async function loadExrImage(name: string, data: Uint8Array): Promise<ThreeTexture> {
	return new Promise((resolve, reject) => {
		new EXRLoader().setDataType(FloatType).load(
			data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as any,
			(texture: ThreeTexture) => resolve(texture),
			undefined,
			(err: any) => reject(err),
		)
	})
}
