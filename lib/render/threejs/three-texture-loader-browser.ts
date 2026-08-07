// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import {
	DataTexture,
	RGBAFormat,
	SRGBColorSpace,
	TextureLoader,
	type Texture as ThreeTexture,
	UnsignedByteType,
} from '../../refs.browser.js'
import type { ITextureLoader } from '../irender-api.js'
import { EXRLoader } from './vendor/EXRLoader.js'

const imageMap: { [key: string]: string } = {
	bumperbase: new URL('../../../res/maps/bumperbase.png', import.meta.url).href,
	bumperCap: new URL('../../../res/maps/bumperCap.png', import.meta.url).href,
	bumperring: new URL('../../../res/maps/bumperring.png', import.meta.url).href,
	bumperskirt: new URL('../../../res/maps/bumperskirt.png', import.meta.url).href,
	kickerCup: new URL('../../../res/maps/kickerCup.png', import.meta.url).href,
	kickerGottlieb: new URL('../../../res/maps/kickerGottlieb.png', import.meta.url).href,
	kickerHoleWood: new URL('../../../res/maps/kickerHoleWood.png', import.meta.url).href,
	kickerT1: new URL('../../../res/maps/kickerT1.png', import.meta.url).href,
	kickerWilliams: new URL('../../../res/maps/kickerWilliams.png', import.meta.url).href,
	ball: new URL('../../../res/maps/ball.png', import.meta.url).href,
}

export class ThreeTextureLoaderBrowser implements ITextureLoader<ThreeTexture> {
	public async loadDefaultTexture(name: string, ext: string, fileName: string): Promise<ThreeTexture> {
		const key = fileName.substr(0, fileName.lastIndexOf('.'))
		if (!imageMap[key]) {
			throw new Error('Unknown local texture "' + key + '".')
		}
		return new TextureLoader().load(imageMap[key])
	}

	public async loadRawTexture(name: string, data: Uint8Array, width: number, height: number): Promise<ThreeTexture> {
		const texture = new DataTexture(data as any, width, height, RGBAFormat as any)
		texture.flipY = true
		texture.colorSpace = SRGBColorSpace
		texture.needsUpdate = true
		return texture
	}

	public async loadTexture(name: string, ext: string, data: Uint8Array): Promise<ThreeTexture> {
		const mimeType = getMimeType(data, ext) || 'image/png'
		const isHdr = mimeType === 'image/hdr' || ext === '.hdr'
		const isExr = mimeType === 'image/exr' || ext === '.exr'
		if (isHdr || isExr) {
			try {
				const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
				const loader = isExr ? new EXRLoader() : new HDRLoader()
				const texture = (loader as any).createDataTexture(buffer) as ThreeTexture
				texture.name = `texture:${name}`
				;(texture as any).colorSpace = SRGBColorSpace
				texture.needsUpdate = true
				;(texture as any).anisotropy = 4
				return downsampleIfNeeded(texture, 2048) as ThreeTexture
			} catch (e: any) {
				throw new Error(`HDR/EXR parse failed for "${name}" (${ext} ${mimeType}): ${e.message}`)
			}
		}
		const objectUrl = URL.createObjectURL(
			new Blob([data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as any], {
				type: mimeType as any,
			}),
		)
		try {
			const texture = await load(mimeType, objectUrl, ext, data)
			texture.name = `texture:${name}`
			texture.colorSpace = SRGBColorSpace
			texture.needsUpdate = true
			texture.anisotropy = 4
			return downsampleIfNeeded(texture, 2048) as ThreeTexture
		} catch (e: any) {
			try {
				URL.revokeObjectURL(objectUrl)
			} catch {}
			throw e
		}
	}
}

function getMimeType(data: Uint8Array, ext: string): string | null {
	if (data.length < 4) return null
	const view = new DataView(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength)
	const header16 = view.getUint16(0, false)
	const header32 = data.length >= 4 ? view.getUint32(0, false) : 0
	switch (header16) {
		case 0x8950:
			return 'image/png'
		case 0xffd8:
			return 'image/jpeg'
		case 0x4749:
			return 'image/gif'
		case 0x424d:
			return 'image/bmp'
	}
	if (header32 === 0x89504e47) return 'image/png'
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
	) {
		return 'image/webp'
	}
	if (data[0] === 0x23 && data[1] === 0x3f) return 'image/hdr'
	if (data[0] === 0x76 && data[1] === 0x2f) return 'image/exr'
	if (ext === '.hdr') return 'image/hdr'
	if (ext === '.exr') return 'image/exr'
	if (ext === '.png') return 'image/png'
	if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
	if (ext === '.bmp') return 'image/bmp'
	if (ext === '.gif') return 'image/gif'
	if (ext === '.webp') return 'image/webp'
	if (data.length > 100) {
		const head = String.fromCharCode(...data.slice(0, 10))
		if (head.includes('JFIF') || head.includes('Exif')) return 'image/jpeg'
		if (head.includes('PNG')) return 'image/png'
		if (head.includes('WEBP')) return 'image/webp'
	}
	return 'image/png'
}

function downsampleIfNeeded(texture: any, maxSize: number): any {
	try {
		const img = texture.image
		if (!img) return texture
		const w = img.width || img.naturalWidth || texture.image?.width
		const h = img.height || img.naturalHeight || texture.image?.height
		if (!w || !h) return texture
		if (w <= maxSize && h <= maxSize) return texture
		const scale = Math.min(maxSize / w, maxSize / h)
		const nw = Math.max(1, Math.floor(w * scale))
		const nh = Math.max(1, Math.floor(h * scale))
		if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
			const canvas = document.createElement('canvas')
			canvas.width = nw
			canvas.height = nh
			const ctx = canvas.getContext('2d')
			if (ctx && img) {
				if (
					img instanceof HTMLImageElement ||
					img instanceof HTMLCanvasElement ||
					(typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap)
				) {
					ctx.drawImage(img as any, 0, 0, nw, nh)
					const newTex = new (texture as any).constructor(canvas) as any
					if (newTex) {
						newTex.needsUpdate = true
						return newTex
					}
				} else if (img.data && w && h) {
					// DataTexture - can't trivially downsample without resampling; return original but mark for GPU
					return texture
				}
			}
		}
	} catch {}
	return texture
}

function load(mimeType: string, url: string, ext?: string, data?: Uint8Array): Promise<ThreeTexture> {
	return new Promise((resolve, reject) => {
		if (
			mimeType === 'image/png' ||
			mimeType === 'image/jpeg' ||
			mimeType === 'image/bmp' ||
			mimeType === 'image/gif' ||
			mimeType === 'image/webp'
		) {
			new TextureLoader().load(
				url,
				(texture) => {
					URL.revokeObjectURL(url)
					resolve(downsampleIfNeeded(texture, 2048) as any)
				},
				undefined,
				(err) => {
					URL.revokeObjectURL(url)
					reject(err)
				},
			)
		} else if (mimeType === 'image/exr' || ext === '.exr') {
			try {
				const buffer = data
					? (data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer)
					: null
				if (buffer) {
					const loader = new EXRLoader()
					const tex = (loader as any).createDataTexture(buffer) as ThreeTexture
					URL.revokeObjectURL(url)
					resolve(downsampleIfNeeded(tex, 2048) as any)
					return
				}
			} catch (e) {}
			new EXRLoader().load(
				url,
				(texture) => {
					URL.revokeObjectURL(url)
					resolve(downsampleIfNeeded(texture, 2048) as any)
				},
				undefined,
				(err) => {
					URL.revokeObjectURL(url)
					reject(err)
				},
			)
		} else {
			try {
				const buffer = data
					? (data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer)
					: null
				if (buffer) {
					const loader = new HDRLoader()
					const tex = (loader as any).createDataTexture(buffer) as ThreeTexture
					URL.revokeObjectURL(url)
					resolve(downsampleIfNeeded(tex, 2048) as any)
					return
				}
			} catch (e) {}
			new HDRLoader().load(
				url,
				(texture) => {
					URL.revokeObjectURL(url)
					resolve(downsampleIfNeeded(texture, 2048) as any)
				},
				undefined,
				(err) => {
					URL.revokeObjectURL(url)
					reject(err)
				},
			)
		}
	})
}
