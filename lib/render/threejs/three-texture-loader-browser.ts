// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import {
	CanvasTexture,
	DataTexture,
	EquirectangularReflectionMapping,
	HalfFloatType,
	LinearFilter,
	LinearMipMapLinearFilter,
	LinearSRGBColorSpace,
	RGBAFormat,
	SRGBColorSpace,
	TextureLoader,
	type Texture as ThreeTexture,
} from '../../refs.browser.js'
import { exrCacheKey, idbGet, idbSet } from '../../util/idb-cache.js'
import type { ITextureLoader } from '../irender-api.js'

const imageMap: Record<string, string> = {
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
	const w = tex.image?.width ?? tex.image?.naturalWidth ?? 0
	const h = tex.image?.height ?? tex.image?.naturalHeight ?? 0
	const small = w > 0 && h > 0 && Math.max(w, h) <= 256
	tex.generateMipmaps = !small
	tex.minFilter = small ? LinearFilter : LinearMipMapLinearFilter
	tex.anisotropy = small ? 1 : 4
}

function nameAndTune(tex: any, name: string): void {
	tex.name = `texture:${name}`
	tex.needsUpdate = true
	tune(tex)
}

function maxFor(name: string, w: number, h: number, isFloat: boolean, playfieldMap?: string): number {
	if (playfieldMap && name.toLowerCase() === playfieldMap.toLowerCase()) return 2048
	if (isFloat) return w <= 512 && h <= 512 ? Math.max(w, h) : MAX_FLOAT
	if (w > 2048 || h > 2048) return 1024
	if (w <= 512 && h <= 512) return Math.max(w, h)
	return MAX_REGULAR
}

function finalize(tex: any, name: string, isFloat: boolean, playfieldMap?: string): any {
	const w = tex.image?.width ?? tex.image?.naturalWidth ?? 0
	const h = tex.image?.height ?? tex.image?.naturalHeight ?? 0
	const max = maxFor(name, w, h, isFloat, playfieldMap)
	const ds = downsample(tex, max)
	if (ds !== tex) {
		try {
			tex.dispose?.()
		} catch {}
		nameAndTune(ds, name)
		return ds
	}
	nameAndTune(tex, name)
	return tex
}

// --- EXR/HDR worker pool ---
const POOL_SIZE = 4
let pool: Worker[] | null = null
let seq = 0
let next = 0
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>()

function getPool(): Worker[] | null {
	if (typeof Worker === 'undefined' || pool) return pool
	try {
		const cores = (navigator as any).hardwareConcurrency ?? 4
		pool = Array.from({ length: Math.min(POOL_SIZE, cores) }, () => {
			const w = new Worker(new URL('./workers/exr-worker.js', import.meta.url), { type: 'module' } as any)
			w.onmessage = ({ data: { id, ok, error, width, height, data, type, format, colorSpace } }: any) => {
				const p = pending.get(id)
				if (!p) return
				pending.delete(id)
				if (!ok) p.reject(new Error(error))
				else p.resolve({ width, height, data, type, format, colorSpace })
			}
			w.onerror = (e: any) => {
				for (const [, p] of pending) p.reject(e.error ?? new Error(String(e.message ?? e)))
				pending.clear()
			}
			return w
		})
	} catch {
		return null
	}
	return pool
}

function parseWorker(buffer: ArrayBuffer, kind: 'exr' | 'hdr'): Promise<any> {
	const p = getPool()
	if (!p?.length) return Promise.reject(new Error('no worker'))
	const w = p[next++ % p.length]!
	const id = ++seq
	return new Promise((resolve, reject) => {
		pending.set(id, { resolve, reject })
		try {
			w.postMessage({ id, buffer, type: kind }, [buffer] as any)
		} catch (e) {
			pending.delete(id)
			reject(e)
		}
		setTimeout(() => {
			if (pending.has(id)) {
				pending.delete(id)
				reject(new Error('exr worker timeout'))
			}
		}, 30000)
	})
}

export class ThreeTextureLoaderBrowser implements ITextureLoader<ThreeTexture> {
	public playfieldMap?: string

	public async loadDefaultTexture(_name: string, _ext: string, fileName: string): Promise<ThreeTexture> {
		const key = fileName.slice(0, fileName.lastIndexOf('.'))
		const url = imageMap[key]
		if (!url) throw new Error(`Unknown local texture "${key}".`)
		const tex: any = await new TextureLoader().loadAsync(url)
		if (key.toLowerCase() === 'ball') {
			tex.mapping = EquirectangularReflectionMapping
			tex.colorSpace = SRGBColorSpace
		}
		const out: any = finalize(tex, _name || fileName, false, this.playfieldMap)
		if (key.toLowerCase() === 'ball') {
			out.mapping = EquirectangularReflectionMapping
			out.colorSpace = SRGBColorSpace
			out.generateMipmaps = true
			out.minFilter = LinearMipMapLinearFilter
			out.needsUpdate = true
		}
		return out
	}

	public async loadRawTexture(name: string, data: Uint8Array, width: number, height: number): Promise<ThreeTexture> {
		const tex: any = new DataTexture(data as any, width, height, RGBAFormat as any)
		tex.flipY = true
		tex.colorSpace = SRGBColorSpace
		tex.needsUpdate = true
		tune(tex)
		const max = maxFor(name, width, height, false, this.playfieldMap)
		const ds = downsample(tex, max)
		if (ds !== tex) {
			try {
				tex.dispose?.()
			} catch {}
			nameAndTune(ds, name)
			return ds
		}
		nameAndTune(tex, name)
		return tex
	}

	public async loadTexture(name: string, ext: string, data: Uint8Array): Promise<ThreeTexture> {
		const mime = getMimeType(data, ext) ?? 'image/png'
		const isHdr = mime === 'image/hdr' || ext === '.hdr'
		const isExr = mime === 'image/exr' || ext === '.exr'

		if (!isHdr && !isExr && typeof createImageBitmap !== 'undefined') {
			const bmp = await tryCreateBitmap(data, mime, name, this.playfieldMap)
			if (bmp) return bmp
		}

		if (isHdr || isExr) {
			const kind = isExr ? ('exr' as const) : ('hdr' as const)
			const cached = await tryLoadCached(name, kind, this.playfieldMap)
			if (cached) return cached
			const viaWorker = await tryLoadViaWorker(name, kind, data, this.playfieldMap)
			if (viaWorker) return viaWorker
			return loadFloatFallback(name, ext, mime, data, this.playfieldMap)
		}

		return loadRegular(name, mime, data, this.playfieldMap)
	}
}

async function tryCreateBitmap(
	data: Uint8Array,
	mime: string,
	name: string,
	playfieldMap?: string,
): Promise<ThreeTexture | null> {
	try {
		const blob = new Blob(
			[
				data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
					? (data as any)
					: (data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as any),
			],
			{ type: mime as any },
		)
		let bitmap: any = await createImageBitmap(blob as any, { imageOrientation: 'flipY' } as any)
		const max = maxFor(name, bitmap.width, bitmap.height, false, playfieldMap)
		if (bitmap.width > max || bitmap.height > max) {
			const scale = Math.min(max / bitmap.width, max / bitmap.height)
			const nw = Math.max(1, Math.floor(bitmap.width * scale))
			const nh = Math.max(1, Math.floor(bitmap.height * scale))
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
					const ctx = canvas.getContext('2d')!
					ctx.imageSmoothingEnabled = true
					;(ctx as any).imageSmoothingQuality = 'high'
					ctx.drawImage(bitmap as any, 0, 0, nw, nh)
					try {
						bitmap.close?.()
					} catch {}
					const tex: any = new CanvasTexture(canvas as any)
					tex.colorSpace = SRGBColorSpace
					tex.flipY = false
					tex.needsUpdate = true
					tune(tex)
					tex.name = `texture:${name}`
					return tex
				} catch {}
			}
		}
		const tex: any = new CanvasTexture(bitmap as any)
		tex.colorSpace = SRGBColorSpace
		tex.flipY = false
		tex.needsUpdate = true
		tune(tex)
		tex.name = `texture:${name}`
		return tex
	} catch {
		return null
	}
}

async function tryLoadCached(
	_name: string,
	_kind: 'exr' | 'hdr',
	_playfieldMap?: string,
): Promise<ThreeTexture | null> {
	try {
		// byteLength unknown yet; try without length? Use exrCacheKey with 0 — but we need actual length, so skip if not found via wildcard
		// Instead attempt to load via idb with known key pattern: we store with byteLength, so we need to probe via data length later.
		// Caller will pass data, so this helper is only used when we don't have data length; we handle cache inside tryLoadViaWorker.
		return null
	} catch {
		return null
	}
}

async function tryLoadViaWorker(
	name: string,
	kind: 'exr' | 'hdr',
	data: Uint8Array,
	playfieldMap?: string,
): Promise<ThreeTexture | null> {
	const key = exrCacheKey(name, data.byteLength, kind)
	try {
		const cached: any = await idbGet(key)
		if (cached?.width && cached?.data) {
			const tex: any = new DataTexture(
				cached.data as any,
				cached.width,
				cached.height,
				cached.format ?? (RGBAFormat as any),
				cached.type ?? (HalfFloatType as any),
			)
			tex.flipY = false
			tex.colorSpace = cached.colorSpace ?? LinearSRGBColorSpace
			tex.needsUpdate = true
			return finalize(tex, name, true, playfieldMap)
		}
	} catch {}
	try {
		const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
		const parsed: any = await parseWorker(buf.slice(0) as ArrayBuffer, kind)
		if (parsed?.width && parsed?.data) {
			try {
				idbSet(key, {
					width: parsed.width,
					height: parsed.height,
					data: parsed.data,
					type: parsed.type,
					format: parsed.format,
					colorSpace: parsed.colorSpace,
				}).catch(() => {})
			} catch {}
			const tex: any = new DataTexture(
				parsed.data as any,
				parsed.width,
				parsed.height,
				parsed.format ?? (RGBAFormat as any),
				parsed.type ?? (HalfFloatType as any),
			)
			tex.flipY = false
			tex.colorSpace = parsed.colorSpace ?? LinearSRGBColorSpace
			tex.needsUpdate = true
			return finalize(tex, name, true, playfieldMap)
		}
	} catch {}
	return null
}

function loadFloatFallback(
	name: string,
	ext: string,
	mime: string,
	data: Uint8Array,
	playfieldMap?: string,
): ThreeTexture {
	try {
		const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
		const Loader = mime === 'image/exr' || ext === '.exr' ? EXRLoader : HDRLoader
		const tex: any = new (Loader as any)().createDataTexture(buf)
		if (tex.colorSpace === SRGBColorSpace) tex.colorSpace = LinearSRGBColorSpace
		return finalize(tex, name, true, playfieldMap)
	} catch (e: any) {
		throw new Error(`HDR/EXR parse failed for "${name}" (${ext} ${mime}): ${e.message}`)
	}
}

async function loadRegular(name: string, mime: string, data: Uint8Array, playfieldMap?: string): Promise<ThreeTexture> {
	const blobPart: any =
		data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
			? data
			: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
	const url = URL.createObjectURL(new Blob([blobPart as any], { type: mime as any }))
	try {
		const tex: any = await loadViaUrl(url, name, playfieldMap)
		tex.name = `texture:${name}`
		tex.colorSpace = SRGBColorSpace
		tex.needsUpdate = true
		return finalize(tex, name, false, playfieldMap)
	} catch (e) {
		try {
			URL.revokeObjectURL(url)
		} catch {}
		throw e
	}
}

function loadViaUrl(url: string, nameHint: string, playfieldMap?: string): Promise<ThreeTexture> {
	return new Promise((resolve, reject) => {
		new TextureLoader().load(
			url,
			(tex: any) => {
				URL.revokeObjectURL(url)
				tune(tex)
				const w = tex.image?.width ?? tex.image?.naturalWidth ?? 0
				const h = tex.image?.height ?? tex.image?.naturalHeight ?? 0
				const max = maxFor(nameHint, w, h, false, playfieldMap)
				const ds = downsample(tex, max)
				if (ds !== tex) {
					try {
						tex.dispose()
					} catch {}
					try {
						tex.image = null
					} catch {}
					resolve(ds)
				} else resolve(tex)
			},
			undefined,
			err => {
				URL.revokeObjectURL(url)
				reject(err)
			},
		)
	})
}

function getMimeType(data: Uint8Array, ext: string): string | null {
	if (data.length < 4) return null
	const v = new DataView(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength)
	const h16 = v.getUint16(0, false)
	if (h16 === 0x8950) return 'image/png'
	if (h16 === 0xffd8) return 'image/jpeg'
	if (h16 === 0x4749) return 'image/gif'
	if (h16 === 0x424d) return 'image/bmp'
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
	if (ext === '.hdr') return 'image/hdr'
	if (ext === '.exr') return 'image/exr'
	if (ext === '.png') return 'image/png'
	if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
	if (ext === '.bmp') return 'image/bmp'
	if (ext === '.gif') return 'image/gif'
	if (ext === '.webp') return 'image/webp'
	return 'image/png'
}

function downsample(texture: any, maxSize: number): any {
	try {
		const img = texture.image
		if (!img) return texture
		if (img.data && img.width && img.height) return downsampleData(texture, maxSize)
		const w = img.width ?? img.naturalWidth ?? 0
		const h = img.height ?? img.naturalHeight ?? 0
		if (!w || !h || (w <= maxSize && h <= maxSize)) return texture
		return downsampleImage(texture, maxSize, w, h)
	} catch {
		return texture
	}
}

function downsampleData(texture: any, maxSize: number): any {
	const { width: w, height: h, data: src } = texture.image
	if (w <= maxSize && h <= maxSize) return texture
	const scale = Math.min(maxSize / w, maxSize / h)
	const nw = Math.max(1, Math.floor(w * scale)),
		nh = Math.max(1, Math.floor(h * scale))
	const channels = Math.round(src.length / (w * h)) || 4
	const dst = new (src.constructor as any)(nw * nh * channels)
	for (let y = 0; y < nh; y++) {
		const sy = Math.min(h - 1, Math.floor((y / nh) * h))
		for (let x = 0; x < nw; x++) {
			const sx = Math.min(w - 1, Math.floor((x / nw) * w))
			const sIdx = (sy * w + sx) * channels,
				dIdx = (y * nw + x) * channels
			for (let c = 0; c < channels; c++) dst[dIdx + c] = src[sIdx + c]
		}
	}
	const tex: any = new DataTexture(dst as any, nw, nh, texture.format ?? RGBAFormat)
	tex.colorSpace = texture.colorSpace ?? SRGBColorSpace
	tex.mapping = texture.mapping ?? tex.mapping
	tex.needsUpdate = true
	tex.name = texture.name
	tune(tex)
	tex.flipY = texture.flipY ?? true
	try {
		texture.dispose?.()
	} catch {}
	try {
		texture.image.data = null
	} catch {}
	return tex
}

function downsampleImage(texture: any, maxSize: number, w: number, h: number): any {
	const scale = Math.min(maxSize / w, maxSize / h)
	const nw = Math.max(1, Math.floor(w * scale)),
		nh = Math.max(1, Math.floor(h * scale))
	if (typeof document === 'undefined' || typeof document.createElement !== 'function') return texture
	const canvas = document.createElement('canvas')
	canvas.width = nw
	canvas.height = nh
	const ctx = canvas.getContext('2d')
	if (!ctx || !texture.image) return texture
	const img = texture.image
	if (
		!(
			img instanceof HTMLImageElement ||
			img instanceof HTMLCanvasElement ||
			(typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap)
		)
	)
		return texture
	try {
		ctx.imageSmoothingEnabled = true
		;(ctx as any).imageSmoothingQuality = 'high'
	} catch {}
	ctx.drawImage(img as any, 0, 0, nw, nh)
	const tex: any = new CanvasTexture(canvas)
	tex.colorSpace = texture.colorSpace ?? SRGBColorSpace
	tex.mapping = texture.mapping ?? tex.mapping
	tex.needsUpdate = true
	tex.name = texture.name
	tune(tex)
	tex.flipY = texture.flipY ?? true
	try {
		texture.dispose?.()
	} catch {}
	try {
		URL.revokeObjectURL((img as any).src)
	} catch {}
	try {
		texture.image = null
	} catch {}
	return tex
}
