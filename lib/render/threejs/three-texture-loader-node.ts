// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import { DataTexture, FloatType, HalfFloatType, RGBAFormat, SRGBColorSpace, type Texture as ThreeTexture } from '../../refs.node.js'
import { logger } from '../../util/logger.js'
import type { ITextureLoader } from '../irender-api.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export class ThreeTextureLoaderNode implements ITextureLoader<ThreeTexture> {
	async loadTexture(name: string, ext: string, data: Uint8Array): Promise<ThreeTexture> {
		try {
			const { data: raw, info } = await (sharp as any)(data).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
			return tex(raw, info.width, info.height, name)
		} catch (e) {
			logger().warn('[Texture] failed to load %s: %s', name, (e as Error).message)
			if (ext === '.hdr') return floatTex(HDRLoader, HalfFloatType, data)
			if (ext === '.exr') return floatTex(EXRLoader, FloatType, data)
			throw e
		}
	}

	async loadRawTexture(name: string, data: Uint8Array, w: number, h: number): Promise<ThreeTexture> {
		return tex(data, w, h, name)
	}

	async loadDefaultTexture(name: string, _: string, file: string): Promise<ThreeTexture> {
		const buf = await readFile(join(__dirname, '../../../res/maps', file))
		return this.loadTexture(name, 'png', buf as unknown as Uint8Array)
	}
}

function tex(data: Uint8Array, w: number, h: number, name: string): ThreeTexture {
	const t = new DataTexture(data, w, h, RGBAFormat)
	t.flipY = false
	t.colorSpace = SRGBColorSpace
	t.needsUpdate = true
	t.name = `texture:${name}`
	return t as unknown as ThreeTexture
}

function floatTex(Loader: any, type: any, data: Uint8Array): Promise<ThreeTexture> {
	return new Promise((res, rej) => new Loader().setDataType(type as never).load(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as never, (v: any) => res(v as ThreeTexture), undefined, rej))
}
