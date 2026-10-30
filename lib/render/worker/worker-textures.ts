// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE

/**
 * Worker-side texture loader: no DOM, no nested workers, no IDB. Regular
 * formats decode via createImageBitmap; EXR/HDR parse in place with three's
 * ArrayBuffer-based loaders. Mirrors the main-thread browser loader's format
 * dispatch without its document, cache, or decode-worker machinery.
 */

import {
	DataTexture,
	HalfFloatType,
	LinearFilter,
	LinearMipMapLinearFilter,
	LinearSRGBColorSpace,
	RGBAFormat,
	RGBFormat,
	SRGBColorSpace,
	Texture,
	type Texture as ThreeTexture,
} from 'three'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import { cappedAniso, getEffectiveCaps } from '../../util/quality.js'
import type { ITextureLoader } from '../irender-api.js'
import { downscaleArray, isPlayfieldCap } from '../threejs/texture-downscale.js'

function maxFor(name: string): number {
	const caps = getEffectiveCaps()
	return isPlayfieldCap(name) ? caps.playfield : caps.other
}

function mimeOf(data: Uint8Array, ext: string): string {
	if (data.length >= 4) {
		const v = new DataView(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength)
		switch (v.getUint16(0, false)) {
			case 0x8950:
				return 'image/png'
			case 0xffd8:
				return 'image/jpeg'
			case 0x4749:
				return 'image/gif'
			case 0x424d:
				return 'image/bmp'
		}
		if (
			data.length >= 12 &&
			data[0] === 0x52 &&
			data[1] === 0x49 &&
			data[2] === 0x46 &&
			data[3] === 0x46 &&
			data[8] === 0x57 &&
			data[9] === 0x45 &&
			data[10] === 0x42 &&
			data[11] === 0x50
		)
			return 'image/webp'
		if (data[0] === 0x23 && data[1] === 0x3f) return 'image/hdr'
		if (data[0] === 0x76 && data[1] === 0x2f) return 'image/exr'
	}
	switch (ext.toLowerCase()) {
		case '.hdr':
			return 'image/hdr'
		case '.exr':
			return 'image/exr'
		case '.jpg':
		case '.jpeg':
			return 'image/jpeg'
		case '.bmp':
			return 'image/bmp'
		case '.gif':
			return 'image/gif'
		case '.webp':
			return 'image/webp'
		default:
			return 'image/png'
	}
}

function tune(tex: ThreeTexture, name: string): void {
	const caps = getEffectiveCaps()
	const img = (tex as unknown as { image?: { width?: number; height?: number } }).image
	const edge = Math.max(img?.width ?? 0, img?.height ?? 0)
	const noMips = /dmd/i.test(name) || (edge > 0 && edge <= 64)
	tex.generateMipmaps = !noMips
	tex.minFilter = noMips ? LinearFilter : LinearMipMapLinearFilter
	tex.magFilter = LinearFilter
	tex.anisotropy = cappedAniso(caps.aniso)
}

function nameAndTune(tex: ThreeTexture, name: string): ThreeTexture {
	tex.name = `texture:${name}`
	tex.needsUpdate = true
	tune(tex, name)
	return tex
}

async function bitmapTexture(name: string, data: Uint8Array, mime: string): Promise<ThreeTexture | null> {
	try {
		const part =
			data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
				? data
				: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
		let bitmap = await createImageBitmap(new Blob([part as ArrayBuffer], { type: mime }), {
			imageOrientation: 'flipY',
		} as ImageBitmapOptions)
		const max = maxFor(name)
		if (bitmap.width > max || bitmap.height > max) {
			const scale = Math.min(max / bitmap.width, max / bitmap.height)
			try {
				const resized = await createImageBitmap(bitmap, {
					resizeWidth: Math.max(1, Math.floor(bitmap.width * scale)),
					resizeHeight: Math.max(1, Math.floor(bitmap.height * scale)),
					resizeQuality: 'high',
				} as ImageBitmapOptions)
				try {
					bitmap.close()
				} catch {}
				bitmap = resized
			} catch {
				try {
					bitmap.close()
				} catch {}
				return null
			}
		}
		const tex = new Texture(bitmap)
		tex.colorSpace = SRGBColorSpace
		tex.flipY = false
		return nameAndTune(tex, name)
	} catch {
		return null
	}
}

function floatTexture(name: string, ext: string, mime: string, data: Uint8Array): ThreeTexture {
	const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
	const Loader = mime === 'image/exr' || ext === '.exr' ? EXRLoader : HDRLoader
	const decoded = new (Loader as new () => { createDataTexture(buf: ArrayBuffer): ThreeTexture })().createDataTexture(
		buf,
	) as ThreeTexture & {
		image: { data: Uint8Array | Uint16Array | Float32Array; width: number; height: number }
		type?: number
		format?: number
	}
	// Cap before upload: an uncapped 8K half-float frame is 512MB in a single
	// writeTexture, over the 256MB WebGPU maxBufferSize on many adapters.
	const img = decoded.image
	const max = maxFor(name)
	if (img?.data && (img.width > max || img.height > max)) {
		const scaled = downscaleArray(img.data, img.width, img.height, max, name, decoded.type)
		const tex = new DataTexture(
			scaled.data,
			scaled.width,
			scaled.height,
			(decoded.format ?? RGBAFormat) as never,
			(decoded.type ?? HalfFloatType) as never,
		)
		tex.colorSpace = LinearSRGBColorSpace
		return nameAndTune(tex, name)
	}
	decoded.colorSpace = LinearSRGBColorSpace
	return nameAndTune(decoded, name)
}

/** White 1x1 stand-in so one unloadable map never kills the worker build. */
function fallbackTexture(name: string): ThreeTexture {
	const tex = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat)
	tex.colorSpace = SRGBColorSpace
	tex.needsUpdate = true
	tex.name = `texture:${name}`
	return tex
}

export class ThreeTextureLoaderWorker implements ITextureLoader<ThreeTexture> {
	private readonly seeded = new Map<string, ImageBitmap>()

	/**
	 * Seed engine defaults transferred from the main thread (no URL guessing).
	 * Produced by viewer `_loadWorkerDefaults` from `defaultTextureUrls`.
	 */
	seedDefaults(bitmaps: Array<{ name: string; bitmap: ImageBitmap }> = []): void {
		for (const { name, bitmap } of bitmaps) this.seeded.set(name.toLowerCase(), bitmap)
	}

	public async loadTexture(name: string, ext: string, data: Uint8Array): Promise<ThreeTexture> {
		const mime = mimeOf(data, ext)
		if (mime === 'image/hdr' || mime === 'image/exr') {
			try {
				return floatTexture(name, ext, mime, data)
			} catch {
				return fallbackTexture(name)
			}
		}
		return (await bitmapTexture(name, data, mime)) ?? fallbackTexture(name)
	}

	public async loadRawTexture(name: string, data: Uint8Array, width: number, height: number): Promise<ThreeTexture> {
		// Cap before upload: raw frames bypass decode so nothing else clamps them.
		const max = maxFor(name)
		if (data.length === width * height * 4 && (width > max || height > max)) {
			const scaled = downscaleArray(data, width, height, max, name)
			data = scaled.data
			width = scaled.width
			height = scaled.height
		}
		let format: number = RGBAFormat
		let src = data
		if (data.length === width * height * 4) {
			let opaque = true
			for (let i = 3; i < data.length; i += 4) {
				if (data[i] !== 0xff) {
					opaque = false
					break
				}
			}
			if (opaque) {
				const rgb = new Uint8Array(width * height * 3)
				for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
					rgb[j] = data[i] ?? 0
					rgb[j + 1] = data[i + 1] ?? 0
					rgb[j + 2] = data[i + 2] ?? 0
				}
				src = rgb
				format = RGBFormat
			}
		}
		const tex = new DataTexture(src, width, height, format as never)
		tex.flipY = true
		tex.colorSpace = SRGBColorSpace
		return nameAndTune(tex, name)
	}

	public async loadDefaultTexture(name: string, _ext: string, fileName: string): Promise<ThreeTexture> {
		const hit =
			this.seeded.get(fileName.toLowerCase()) ?? this.seeded.get(fileName.replace(/\.[^.]*$/, '').toLowerCase())
		if (!hit) throw new Error(`Unknown local texture "${fileName}".`)
		const tex = new Texture(hit)
		tex.colorSpace = SRGBColorSpace
		tex.flipY = false
		return nameAndTune(tex, name || fileName)
	}

	public hasDefaultTexture(name: string): boolean {
		const key = name.replace(/\.[^.]*$/, '').toLowerCase()
		return this.seeded.has(name.toLowerCase()) || this.seeded.has(key)
	}
}
