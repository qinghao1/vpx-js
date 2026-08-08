// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import {
	CanvasTexture,
	DataTexture,
	FloatType,
	HalfFloatType,
	LinearFilter,
	LinearMipMapLinearFilter,
	LinearSRGBColorSpace,
	RGBAFormat,
	SRGBColorSpace,
	TextureLoader,
	type Texture as ThreeTexture,
	UnsignedByteType,
} from '../../refs.browser.js'
import { exrCacheKey, idbGet, idbSet } from '../../util/idb-cache.js'
import type { ITextureLoader } from '../irender-api.js'

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

const MAX_REGULAR = 1024
const MAX_FLOAT = 512

function tune(tex: any): void {
	const w = (tex.image as any)?.width || tex.image?.width || 0
	const h = (tex.image as any)?.height || tex.image?.height || 0
	const small = w > 0 && h > 0 && Math.max(w, h) <= 256
	tex.generateMipmaps = !small
	tex.minFilter = (small ? LinearFilter : LinearMipMapLinearFilter) as any
	tex.anisotropy = small ? 1 : 4
}

function nameAndTune(tex: any, name: string): void {
	tex.name = `texture:${name}`
	tex.needsUpdate = true
	tune(tex)
}

function getMaxSizeForTexture(name: string, w: number, h: number, isFloat: boolean, playfieldMap?: string): number {
	try {
		if (playfieldMap && name && name.toLowerCase() === playfieldMap.toLowerCase()) return 2048
		if (isFloat) {
			if (w <= 512 && h <= 512) return Math.max(w, h)
			return MAX_FLOAT
		}
		if (w > 2048 || h > 2048) return 1024
		if (w <= 512 && h <= 512) return Math.max(w, h)
		return MAX_REGULAR
	} catch {
		return isFloat ? MAX_FLOAT : MAX_REGULAR
	}
}

const EXR_POOL_SIZE = 4
let exrPool: Worker[] | null = null
let exrSeq = 0
let exrNext = 0
const exrPending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>()

function getExrPool(): Worker[] | null {
	if (typeof Worker === 'undefined') return null
	if (exrPool) return exrPool
	try {
		const pool: Worker[] = []
		const size = Math.min(
			EXR_POOL_SIZE,
			(typeof navigator !== 'undefined' && (navigator as any).hardwareConcurrency) || 4,
		)
		for (let i = 0; i < size; i++) {
			const w = new Worker(new URL('./workers/exr-worker.js', import.meta.url), { type: 'module' } as any)
			w.onmessage = (e: MessageEvent) => {
				const { id, ok, error, width, height, data, type, format, colorSpace } = e.data as any
				const p = exrPending.get(id)
				if (!p) return
				exrPending.delete(id)
				if (!ok) p.reject(new Error(error))
				else p.resolve({ width, height, data, type, format, colorSpace })
			}
			w.onerror = (e: any) => {
				for (const [, p] of exrPending) p.reject(e.error || new Error(String(e.message || e)))
				exrPending.clear()
			}
			pool.push(w)
		}
		exrPool = pool
		return pool
	} catch {
		return null
	}
}

async function parseWithWorker(buffer: ArrayBuffer, kind: 'exr' | 'hdr'): Promise<any> {
	const pool = getExrPool()
	if (!pool || !pool.length) throw new Error('no worker')
	const w = pool[exrNext++ % pool.length]
	const id = ++exrSeq
	return await new Promise((resolve, reject) => {
		exrPending.set(id, { resolve, reject })
		try {
			w.postMessage({ id, buffer, type: kind }, [buffer] as any)
		} catch (e) {
			exrPending.delete(id)
			reject(e)
		}
		setTimeout(() => {
			if (exrPending.has(id)) {
				exrPending.delete(id)
				reject(new Error('exr worker timeout'))
			}
		}, 30000)
	})
}

/** ThreeTextureLoaderBrowser. */
export class ThreeTextureLoaderBrowser implements ITextureLoader<ThreeTexture> {
	public playfieldMap?: string
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
		tune(texture)
		const max = getMaxSizeForTexture(name, width, height, false, this.playfieldMap)
		const ds = downsampleIfNeeded(texture, max, name)
		if (ds && ds !== texture) {
			try {
				;(texture as any).dispose?.()
			} catch {}
			nameAndTune(ds as any, name)
			return ds as ThreeTexture
		}
		return texture
	}

	public async loadTexture(name: string, ext: string, data: Uint8Array): Promise<ThreeTexture> {
		const mimeType = getMimeType(data, ext) || 'image/png'
		if (
			!mimeType.includes('hdr') &&
			!mimeType.includes('exr') &&
			ext !== '.hdr' &&
			ext !== '.exr' &&
			typeof createImageBitmap !== 'undefined'
		) {
			try {
				const canUseZeroCopy2 = data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
				const blobPart2: any = canUseZeroCopy2
					? data
					: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
				const blob2 = new Blob([blobPart2 as any], { type: mimeType as any })
				let bitmap: any = await createImageBitmap(blob2 as any, { imageOrientation: 'flipY' } as any)
				const w = bitmap.width,
					h = bitmap.height
				const max = getMaxSizeForTexture(name, w, h, false, this.playfieldMap)
				if (w > max || h > max) {
					const scale = Math.min(max / w, max / h)
					const nw = Math.max(1, Math.floor(w * scale)),
						nh = Math.max(1, Math.floor(h * scale))
					try {
						const resized: any = await (createImageBitmap as any)(bitmap, {
							resizeWidth: nw,
							resizeHeight: nh,
							resizeQuality: 'high',
						} as any)
						try {
							bitmap.close?.()
						} catch {}
						bitmap = resized
					} catch {
						try {
							const canvas = document.createElement('canvas')
							canvas.width = nw
							canvas.height = nh
							const ctx = canvas.getContext('2d')
							if (ctx) {
								ctx.imageSmoothingEnabled = true
								;(ctx as any).imageSmoothingQuality = 'high'
								ctx.drawImage(bitmap as any, 0, 0, nw, nh)
								try {
									bitmap.close?.()
								} catch {}
								const tex2: any = new CanvasTexture(canvas as any)
								tex2.colorSpace = SRGBColorSpace
								tex2.flipY = false
								tex2.needsUpdate = true
								tune(tex2)
								tex2.name = `texture:${name}`
								return tex2 as ThreeTexture
							}
						} catch {}
					}
				}
				const tex: any = new CanvasTexture(bitmap as any)
				tex.colorSpace = SRGBColorSpace
				tex.flipY = false
				tex.needsUpdate = true
				tune(tex)
				tex.name = `texture:${name}`
				return tex as ThreeTexture
			} catch {}
		}
		const isHdr = mimeType === 'image/hdr' || ext === '.hdr'
		const isExr = mimeType === 'image/exr' || ext === '.exr'
		if (isHdr || isExr) {
			const kind: 'exr' | 'hdr' = isExr ? 'exr' : 'hdr'
			const tryWorker = async (): Promise<ThreeTexture> => {
				const rawLen = data.byteLength
				const cacheKey = exrCacheKey(name, rawLen, kind)
				try {
					const cached: any = await idbGet(cacheKey)
					if (cached && cached.width && cached.data) {
						const tex = new DataTexture(
							cached.data as any,
							cached.width,
							cached.height,
							cached.format || (RGBAFormat as any),
							cached.type ?? (HalfFloatType as any),
						)
						tex.flipY = false
						tex.colorSpace = (cached.colorSpace as any) || LinearSRGBColorSpace
						tex.needsUpdate = true
						nameAndTune(tex as any, name)
						const max = getMaxSizeForTexture(name, cached.width, cached.height, true, this.playfieldMap)
						const ds = downsampleIfNeeded(tex as any, max, name)
						if (ds && ds !== tex) {
							try {
								;(tex as any).dispose?.()
							} catch {}
							return ds as ThreeTexture
						}
						return tex as ThreeTexture
					}
				} catch {}
				const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
				let parsed: any = null
				try {
					parsed = await parseWithWorker(buf.slice(0) as ArrayBuffer, kind)
				} catch {}
				if (parsed && parsed.width && parsed.data) {
					try {
						const toCache: any = {
							width: parsed.width,
							height: parsed.height,
							data: parsed.data,
							type: parsed.type,
							format: parsed.format,
							colorSpace: parsed.colorSpace,
						}
						idbSet(cacheKey, toCache).catch(() => {})
					} catch {}
					const tex = new DataTexture(
						parsed.data as any,
						parsed.width,
						parsed.height,
						parsed.format || (RGBAFormat as any),
						parsed.type ?? (HalfFloatType as any),
					)
					tex.flipY = false
					tex.colorSpace = (parsed.colorSpace as any) || LinearSRGBColorSpace
					tex.needsUpdate = true
					nameAndTune(tex as any, name)
					const max = getMaxSizeForTexture(name, parsed.width, parsed.height, true, this.playfieldMap)
					const ds = downsampleIfNeeded(tex as any, max, name)
					if (ds && ds !== tex) {
						try {
							;(tex as any).dispose?.()
						} catch {}
						return ds as ThreeTexture
					}
					return tex as ThreeTexture
				}
				throw new Error('worker parse failed')
			}
			try {
				return await tryWorker()
			} catch {
				try {
					const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
					const loader = isExr ? new EXRLoader() : new HDRLoader()
					const texture = (loader as any).createDataTexture(buffer) as ThreeTexture
					nameAndTune(texture as any, name)
					if ((texture as any).colorSpace === SRGBColorSpace) (texture as any).colorSpace = LinearSRGBColorSpace
					const w = (texture.image as any)?.width || 0
					const h = (texture.image as any)?.height || 0
					const max = getMaxSizeForTexture(name, w, h, true, this.playfieldMap)
					const ds = downsampleIfNeeded(texture, max, name)
					if (ds && ds !== texture) {
						try {
							;(texture as any).dispose?.()
						} catch {}
						if ((ds as any).image?.data) tune(ds as any)
						return ds as ThreeTexture
					}
					return texture as ThreeTexture
				} catch (e: any) {
					throw new Error(`HDR/EXR parse failed for "${name}" (${ext} ${mimeType}): ${e.message}`)
				}
			}
		}
		const canUseZeroCopy = data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
		const blobPart: any = canUseZeroCopy ? data : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
		const objectUrl = URL.createObjectURL(new Blob([blobPart as any], { type: mimeType as any }))
		try {
			const texture = await load(mimeType, objectUrl, ext, data, name, this.playfieldMap)
			texture.name = `texture:${name}`
			texture.colorSpace = SRGBColorSpace
			texture.needsUpdate = true
			tune(texture as any)
			const w = (texture.image as any)?.width || (texture.image as any)?.naturalWidth || 0
			const h = (texture.image as any)?.height || (texture.image as any)?.naturalHeight || 0
			const max = getMaxSizeForTexture(name, w, h, false, this.playfieldMap)
			const ds = downsampleIfNeeded(texture, max, name) as any
			if (ds && ds !== texture) {
				try {
					texture.dispose()
				} catch {}
				try {
					;(texture as any).image = null
				} catch {}
				nameAndTune(ds as any, name)
				return ds as ThreeTexture
			}
			return texture as ThreeTexture
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

function downsampleIfNeeded(texture: any, maxSize: number, nameHint?: string): any {
	try {
		const img = texture.image
		if (!img) return texture
		// handle DataTexture (HDR/EXR) with raw data buffer
		if (img.data && img.width && img.height) {
			const w = img.width as number
			const h = img.height as number
			if (w <= maxSize && h <= maxSize) return texture
			// DataTexture downsample: nearest-neighbor on float/byte data
			try {
				const scale = Math.min(maxSize / w, maxSize / h)
				const nw = Math.max(1, Math.floor(w * scale))
				const nh = Math.max(1, Math.floor(h * scale))
				const src = img.data as any
				const isFloat = src instanceof Float32Array || src instanceof Uint16Array
				// infer channels: data length / (w*h)
				const channels = Math.round(src.length / (w * h)) || 4
				const dst = new (src.constructor as any)(nw * nh * channels)
				for (let y = 0; y < nh; y++) {
					const sy = Math.min(h - 1, Math.floor((y / nh) * h))
					for (let x = 0; x < nw; x++) {
						const sx = Math.min(w - 1, Math.floor((x / nw) * w))
						const sIdx = (sy * w + sx) * channels
						const dIdx = (y * nw + x) * channels
						for (let c = 0; c < channels; c++) dst[dIdx + c] = src[sIdx + c]
					}
				}
				const newTex = new DataTexture(dst as any, nw, nh, (texture as any).format || RGBAFormat)
				newTex.needsUpdate = true
				newTex.colorSpace = (texture as any).colorSpace || LinearSRGBColorSpace
				newTex.flipY = (texture as any).flipY ?? true
				tune(newTex)
				newTex.magFilter = LinearFilter as any
				newTex.type = (texture as any).type || (isFloat ? (texture as any).type : UnsignedByteType)
				newTex.name = (texture as any).name
				try {
					texture.dispose?.()
				} catch {}
				try {
					;(texture as any).image = null
				} catch {}
				return newTex
			} catch {
				return texture
			}
		}
		const w = img.width || (img as any).naturalWidth || texture.image?.width
		const h = img.height || (img as any).naturalHeight || texture.image?.height
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
					try {
						ctx.imageSmoothingEnabled = true
						;(ctx as any).imageSmoothingQuality = 'high'
					} catch {}
					ctx.drawImage(img as any, 0, 0, nw, nh)
					// use CanvasTexture to preserve correct filtering/colorSpace
					const newTex = new CanvasTexture(canvas) as any
					newTex.colorSpace = (texture as any).colorSpace || SRGBColorSpace
					newTex.needsUpdate = true
					newTex.name = (texture as any).name
					tune(newTex)
					newTex.flipY = (texture as any).flipY ?? true
					try {
						texture.dispose?.()
					} catch {}
					try {
						URL.revokeObjectURL((img as any).src)
					} catch {}
					try {
						;(texture as any).image = null
					} catch {}
					return newTex
				}
			}
		}
	} catch {}
	return texture
}

function load(
	mimeType: string,
	url: string,
	ext?: string,
	data?: Uint8Array,
	nameHint?: string,
	playfieldMap?: string,
): Promise<ThreeTexture> {
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
					tune(texture as any)
					const w = (texture.image as any)?.width || (texture.image as any)?.naturalWidth || 0
					const h = (texture.image as any)?.height || (texture.image as any)?.naturalHeight || 0
					const max = nameHint ? getMaxSizeForTexture(nameHint, w, h, false, playfieldMap) : MAX_REGULAR
					const ds = downsampleIfNeeded(texture, max, nameHint) as any
					if (ds && ds !== texture) {
						try {
							texture.dispose()
						} catch {}
						try {
							;(texture as any).image = null
						} catch {}
						resolve(ds)
					} else resolve(texture as any)
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
					const w = (tex.image as any)?.width || 0
					const h = (tex.image as any)?.height || 0
					const max = nameHint ? getMaxSizeForTexture(nameHint, w, h, true, playfieldMap) : MAX_FLOAT
					resolve(downsampleIfNeeded(tex, max, nameHint) as any)
					return
				}
			} catch (e) {}
			new EXRLoader().load(
				url,
				(texture) => {
					URL.revokeObjectURL(url)
					tune(texture as any)
					const w = (texture.image as any)?.width || 0
					const h = (texture.image as any)?.height || 0
					const max = nameHint ? getMaxSizeForTexture(nameHint, w, h, true, playfieldMap) : MAX_FLOAT
					const ds = downsampleIfNeeded(texture, max, nameHint) as any
					if (ds && ds !== texture) {
						try {
							texture.dispose()
						} catch {}
						resolve(ds)
					} else resolve(texture as any)
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
					const w = (tex.image as any)?.width || 0
					const h = (tex.image as any)?.height || 0
					const max = nameHint ? getMaxSizeForTexture(nameHint, w, h, true, playfieldMap) : MAX_FLOAT
					resolve(downsampleIfNeeded(tex, max, nameHint) as any)
					return
				}
			} catch (e) {}
			new HDRLoader().load(
				url,
				(texture) => {
					URL.revokeObjectURL(url)
					tune(texture as any)
					const w = (texture.image as any)?.width || 0
					const h = (texture.image as any)?.height || 0
					const max = nameHint ? getMaxSizeForTexture(nameHint, w, h, true, playfieldMap) : MAX_FLOAT
					const ds = downsampleIfNeeded(texture, max, nameHint) as any
					if (ds && ds !== texture) {
						try {
							texture.dispose()
						} catch {}
						resolve(ds)
					} else resolve(texture as any)
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
