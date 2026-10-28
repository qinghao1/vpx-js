// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import {
	CanvasTexture,
	ClampToEdgeWrapping,
	DataTexture,
	EquirectangularReflectionMapping,
	HalfFloatType,
	LinearFilter,
	LinearMipMapLinearFilter,
	LinearSRGBColorSpace,
	RGBAFormat,
	RGBFormat,
	SRGBColorSpace,
	Texture,
	TextureLoader,
	type Texture as ThreeTexture,
} from '../../refs.browser.js'
import { bitmapCacheKey, exrCacheKey, idbGet, idbSet } from '../../util/idb-cache.js'
import { logger } from '../../util/logger.js'
import { _resetQualityCache, cappedAniso, getEffectiveCaps, MAX_FLOAT_TEXTURE_BYTES } from '../../util/quality.js'
import type { ITextureLoader } from '../irender-api.js'
import { decodeInWorker, hasImageWorker } from './image-worker-pool.js'
import { RE_PLAYFIELD } from './material-shared.js'
import { downscaleArray } from './texture-downscale.js'

/** Engine-default lookup key: filename without path or extension (dotless names stay whole). */
function defaultKeyFor(fileName: string): string {
	const dot = fileName.lastIndexOf('.')
	return dot >= 0 ? fileName.slice(0, dot) : fileName
}

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
}

/** Worker OOM-bound rejections (fail-fast size guard), as opposed to genuine decode failures. */
function isFloatSizeRejection(e: unknown): boolean {
	return /too large to decode/.test((e as Error)?.message ?? String(e))
}

export function effectiveMax(_isFloat: boolean, name?: string): number {
	const caps = getEffectiveCaps()
	return name && RE_PLAYFIELD.test(name) ? caps.playfield : caps.other
}

export function _testResetTextureLimits(): void {
	_resetQualityCache()
}

/** No mip chain for magnified DMD panels or tiny (≤64px) icons: ~33% GPU and upload for nothing. */
const RE_NOMIPMAP = /dmd/i
const NOMIPMAP_MAX_EDGE = 64

function tune(tex: any, name?: string): void {
	const caps = getEffectiveCaps()
	const img = tex?.image
	const edge = Math.max(img?.width ?? 0, img?.height ?? 0)
	const noMips = (!!name && RE_NOMIPMAP.test(name)) || (edge > 0 && edge <= NOMIPMAP_MAX_EDGE)
	tex.generateMipmaps = !noMips
	tex.minFilter = noMips ? LinearFilter : LinearMipMapLinearFilter
	tex.magFilter = LinearFilter
	tex.anisotropy = cappedAniso(caps.aniso)
}

function nameAndTune(tex: any, name: string): void {
	tex.name = `texture:${name}`
	tex.needsUpdate = true
	tune(tex, name)
}

function textureFromBitmap(bitmap: any, name: string): any {
	const tex: any = new Texture(bitmap as any)
	tex.colorSpace = SRGBColorSpace
	tex.flipY = false
	tex.needsUpdate = true
	tex.name = `texture:${name}`
	tune(tex, name)
	return tex
}

/** Zero-copy blob part: slice only when the view does not span its buffer. */
function toBlobPart(data: Uint8Array): Uint8Array | ArrayBufferLike {
	return data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
		? data
		: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
}

function finalize(tex: any, name: string, isFloat: boolean): any {
	// three@0.185 uploads ImageBitmap directly; the canvas copy only added alloc + upload.
	const max = effectiveMax(isFloat, name)
	if (tex.image?.data && tex.image.width && tex.image.height) {
		const ds = downsampleData(tex, max, name)
		if (ds !== tex) {
			tex.dispose?.()
			nameAndTune(ds, name)
			return ds
		}
	}
	nameAndTune(tex, name)
	return tex
}

let worker: Worker | null = null
let seq = 0
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>()

function getWorker(): Worker | null {
	if (typeof Worker !== 'undefined' && worker) return worker
	if (typeof Worker === 'undefined') return null
	try {
		worker = new Worker(new URL('./workers/exr-worker.js', import.meta.url), { type: 'module' } as any)
		worker.onmessage = ({ data: { id, ok, error, width, height, data, type, format, colorSpace } }: any) => {
			const p = pending.get(id)
			if (!p) return
			pending.delete(id)
			if (!ok) p.reject(new Error(error))
			else p.resolve({ width, height, data, type, format, colorSpace })
		}
		worker.onerror = (e: any) => {
			for (const [, p] of pending) p.reject(e.error ?? new Error(String(e.message ?? e)))
			pending.clear()
		}
	} catch {
		return null
	}
	return worker
}

function parseWorker(buffer: ArrayBuffer, kind: 'exr' | 'hdr', max?: number, name?: string): Promise<any> {
	const w = getWorker()
	if (!w) return Promise.reject(new Error('no worker'))
	const id = ++seq
	return new Promise((resolve, reject) => {
		pending.set(id, { resolve, reject })
		try {
			w.postMessage({ id, buffer, type: kind, max, name }, [buffer] as any)
		} catch (e) {
			pending.delete(id)
			reject(e)
		}
		setTimeout(() => {
			if (pending.has(id)) {
				pending.delete(id)
				reject(new Error('exr worker timeout'))
			}
		}, 120000)
	})
}

/** Cache resized bitmaps ≤4MB in IDB; larger ones re-decode (as EXR-only did before). */
const MAX_CACHED_BITMAP_BYTES = 4 * 1024 * 1024

/** IDB revivals quack like a bitmap without the realm's prototype. */
function asCachedBitmap(cached: any): any {
	const ok =
		cached &&
		typeof cached.width === 'number' &&
		typeof cached.height === 'number' &&
		(typeof ImageBitmap === 'undefined' || cached instanceof ImageBitmap || typeof cached.close === 'function')
	return ok ? cached : null
}

async function loadRegularWorker(name: string, mime: string, data: Uint8Array): Promise<ThreeTexture | null> {
	const max = effectiveMax(false, name)
	const key = bitmapCacheKey(name, data, mime, max)
	try {
		const hit = asCachedBitmap(await idbGet(key))
		if (hit) return textureFromBitmap(hit, name) as ThreeTexture
	} catch {}
	try {
		const bitmap: any = await decodeInWorker(data, mime, max, name)
		if (bitmap?.width > 0 && bitmap?.height > 0 && bitmap.width * bitmap.height * 4 <= MAX_CACHED_BITMAP_BYTES) {
			// Async persist; the live bitmap stays usable.
			idbSet(key, bitmap as any).catch(() => {})
		}
		return textureFromBitmap(bitmap, name) as ThreeTexture
	} catch {
		return null
	}
}

export class ThreeTextureLoaderBrowser implements ITextureLoader<ThreeTexture> {
	public playfieldMap?: string

	public hasDefaultTexture(name: string): boolean {
		const key = defaultKeyFor(name).toLowerCase()
		if (key === 'ball') return true
		return Object.keys(imageMap).some(k => k.toLowerCase() === key)
	}

	public async loadDefaultTexture(_name: string, _ext: string, fileName: string): Promise<ThreeTexture> {
		// Dotless names (engine fallbacks) have no extension to strip; slicing
		// to lastIndexOf('.') === -1 would eat the final character instead.
		const key = defaultKeyFor(fileName)
		if (key.toLowerCase() === 'ball') return createBallEnvTexture(_name || fileName)
		const url = imageMap[key]
		if (!url) throw new Error(`Unknown local texture "${key}".`)
		const tex: any = await new TextureLoader().loadAsync(url)
		return finalize(tex, _name || fileName, false)
	}

	public async loadRawTexture(name: string, data: Uint8Array, width: number, height: number): Promise<ThreeTexture> {
		let format: any = RGBAFormat
		let src: Uint8Array = data
		if (data.length === width * height * 4) {
			let opaque = true
			for (let i = 3; i < data.length; i += 4)
				if (data[i] !== 0xff) {
					opaque = false
					break
				}
			if (opaque) {
				const rgb = new Uint8Array(width * height * 3)
				for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
					rgb[j] = data[i]
					rgb[j + 1] = data[i + 1]
					rgb[j + 2] = data[i + 2]
				}
				src = rgb
				format = RGBFormat
			}
		}
		const tex: any = new DataTexture(src as any, width, height, format as any)
		tex.flipY = true
		tex.colorSpace = SRGBColorSpace
		tex.needsUpdate = true
		return finalize(tex, name, false)
	}

	public async loadTexture(name: string, ext: string, data: Uint8Array): Promise<ThreeTexture> {
		const mime = getMimeType(data, ext) ?? 'image/png'
		const isHdr = mime === 'image/hdr' || ext === '.hdr'
		const isExr = mime === 'image/exr' || ext === '.exr'
		// Worker decode is skipped for huge payloads (transfer/parse cost),
		// but the main-thread bitmap path still runs: it resizes down to the
		// effective cap, while loadRegular would attempt a full-size upload.
		const tooLarge = data.byteLength > 16 * 1024 * 1024
		if (!isHdr && !isExr) {
			if (!tooLarge && hasImageWorker()) {
				const workerTex = await loadRegularWorker(name, mime, data).catch(() => null)
				if (workerTex) return workerTex
			}
			if (typeof createImageBitmap !== 'undefined') {
				const bmp = await tryCreateBitmap(data, mime, name)
				if (bmp) return bmp
			}
		}
		if (isHdr || isExr) {
			const kind = isExr ? ('exr' as const) : ('hdr' as const)
			try {
				const viaWorker = await tryLoadViaWorker(name, kind, data)
				if (viaWorker) return viaWorker
			} catch (e) {
				// The worker OOM bound rejects huge payloads before decode, but
				// playfield lightmap bakes gate playfield brightness: a missing
				// nestmap leaves the GI overlays mapless and the playfield dark.
				// Let those fall through to the slow main-thread decode with a
				// single warning; every other worker failure still throws.
				if (!isFloatSizeRejection(e) || !RE_PLAYFIELD.test(name)) throw e
				logger().warn(
					'[ThreeTextureLoaderBrowser.loadTexture] Float texture %s is %sMB (> %sMB worker cap): slow main-thread decode',
					name,
					(data.byteLength / 1048576).toFixed(1),
					(MAX_FLOAT_TEXTURE_BYTES / 1048576).toFixed(0),
				)
			}
			return loadFloatFallback(name, ext, mime, data)
		}
		return loadRegular(name, mime, data)
	}
}

// POT 256×128 avoids SwiftShader failure with NPOT + Repeat + mips
function createBallEnvTexture(name: string): ThreeTexture {
	const w = 256
	const h = 128
	if (typeof document === 'undefined') {
		const tex: any = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat)
		tex.colorSpace = SRGBColorSpace
		tex.needsUpdate = true
		tex.name = `texture:${name}`
		return tex as ThreeTexture
	}
	const canvas = document.createElement('canvas')
	canvas.width = w
	canvas.height = h
	const ctx = canvas.getContext('2d')!
	const bg = ctx.createLinearGradient(0, 0, 0, h)
	bg.addColorStop(0, '#14181a')
	bg.addColorStop(0.32, '#787b80')
	bg.addColorStop(0.5, '#f2f2f3')
	bg.addColorStop(0.68, '#787b80')
	bg.addColorStop(1, '#0c0e10')
	ctx.fillStyle = bg
	ctx.fillRect(0, 0, w, h)
	const rg = ctx.createRadialGradient(w * 0.46, h * 0.34, 1, w * 0.46, h * 0.34, 30)
	rg.addColorStop(0, 'rgba(255,255,255,1)')
	rg.addColorStop(0.25, 'rgba(255,255,255,0.55)')
	rg.addColorStop(1, 'rgba(255,255,255,0)')
	ctx.fillStyle = rg
	ctx.fillRect(0, 0, w, h)
	const rg2 = ctx.createRadialGradient(w * 0.76, h * 0.68, 1, w * 0.76, h * 0.68, 14)
	rg2.addColorStop(0, 'rgba(255,255,255,0.35)')
	rg2.addColorStop(1, 'rgba(255,255,255,0)')
	ctx.fillStyle = rg2
	ctx.fillRect(0, 0, w, h)
	const tex: any = new CanvasTexture(canvas as any)
	tex.colorSpace = SRGBColorSpace
	tex.mapping = EquirectangularReflectionMapping
	tex.wrapS = ClampToEdgeWrapping
	tex.wrapT = ClampToEdgeWrapping
	tex.generateMipmaps = false
	tex.minFilter = LinearFilter
	tex.magFilter = LinearFilter
	tex.needsUpdate = true
	tex.name = `texture:${name}`
	return tex as ThreeTexture
}

async function tryCreateBitmap(data: Uint8Array, mime: string, name: string): Promise<ThreeTexture | null> {
	try {
		const blob = new Blob([toBlobPart(data) as any], { type: mime as any })
		let bitmap: any = await createImageBitmap(blob as any, { imageOrientation: 'flipY' } as any)
		const max = effectiveMax(false, name)
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
					bitmap.close?.()
				} catch {}
				return null
			}
		}
		return textureFromBitmap(bitmap, name)
	} catch {
		return null
	}
}

async function tryLoadViaWorker(name: string, kind: 'exr' | 'hdr', data: Uint8Array): Promise<ThreeTexture | null> {
	const max = effectiveMax(true, name)
	const key = exrCacheKey(name, data, kind, max)
	const cached: any = await idbGet(key)
	if (cached?.width && cached?.data) {
		return finalize(
			floatTex(cached.width, cached.height, cached.data, cached.type, cached.format, cached.colorSpace),
			name,
			true,
		)
	}
	// Bound the worst case before touching the worker: EXR/HDR decoders expand
	// to a full-res half-float frame first (8192x8192 RGBA16F is 512MB) and
	// downsample only afterwards, so an uncapped decode OOMs or stalls. Fail
	// fast with 'too large' so the map generator skips the texture on its
	// debug path and the failure cooldown absorbs demand retries.
	if (data.byteLength > MAX_FLOAT_TEXTURE_BYTES) {
		throw new Error(
			`Float texture "${name}" is too large to decode ` +
				`(${(data.byteLength / 1048576).toFixed(1)}MB > ${MAX_FLOAT_TEXTURE_BYTES / 1048576}MB cap): ` +
				`skipped before worker decode`,
		)
	}
	const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
	const parsed: any = await parseWorker(buf, kind, max, name)
	if (parsed?.width && parsed?.data) {
		idbSet(key, {
			width: parsed.width,
			height: parsed.height,
			data: parsed.data,
			type: parsed.type,
			format: parsed.format,
			colorSpace: parsed.colorSpace,
		}).catch(() => {})
		return finalize(
			floatTex(parsed.width, parsed.height, parsed.data, parsed.type, parsed.format, parsed.colorSpace),
			name,
			true,
		)
	}
	return null
}

function floatTex(width: number, height: number, data: any, type: any, format: any, colorSpace: any): ThreeTexture {
	const tex: any = new DataTexture(
		data as any,
		width,
		height,
		format ?? (RGBAFormat as any),
		type ?? (HalfFloatType as any),
	)
	tex.flipY = false
	tex.colorSpace = colorSpace ?? LinearSRGBColorSpace
	tex.needsUpdate = true
	return tex as ThreeTexture
}

function loadFloatFallback(name: string, ext: string, mime: string, data: Uint8Array): ThreeTexture {
	try {
		const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
		const Loader = mime === 'image/exr' || ext === '.exr' ? EXRLoader : HDRLoader
		const tex: any = new (Loader as any)().createDataTexture(buf)
		tex.colorSpace = LinearSRGBColorSpace
		return finalize(tex, name, true)
	} catch (e: any) {
		throw new Error(`HDR/EXR parse failed for "${name}" (${ext} ${mime}): ${e.message}`)
	}
}

async function loadRegular(name: string, mime: string, data: Uint8Array): Promise<ThreeTexture> {
	const url = URL.createObjectURL(new Blob([toBlobPart(data) as any], { type: mime as any }))
	try {
		const tex: any = await new TextureLoader().loadAsync(url)
		tex.colorSpace = SRGBColorSpace
		const img: any = tex.image
		const max = effectiveMax(false, name)
		if (
			img &&
			typeof img.width === 'number' &&
			typeof img.height === 'number' &&
			(img.width > max || img.height > max) &&
			typeof document !== 'undefined'
		) {
			const scale = Math.min(max / img.width, max / img.height)
			const nw = Math.max(1, Math.floor(img.width * scale))
			const nh = Math.max(1, Math.floor(img.height * scale))
			try {
				const canvas = document.createElement('canvas')
				canvas.width = nw
				canvas.height = nh
				const ctx: any = canvas.getContext('2d')
				if (ctx) {
					ctx.imageSmoothingEnabled = true
					ctx.imageSmoothingQuality = 'high'
					ctx.drawImage(img as any, 0, 0, nw, nh)
					const cTex: any = new CanvasTexture(canvas as any)
					cTex.colorSpace = SRGBColorSpace
					cTex.name = `texture:${name}`
					tune(cTex, name)
					try {
						tex.dispose?.()
					} catch {}
					return cTex as ThreeTexture
				}
			} catch {}
		}
		return finalize(tex, name, false)
	} finally {
		URL.revokeObjectURL(url)
	}
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
	const e = ext.toLowerCase()
	return (
		{
			'.hdr': 'image/hdr',
			'.exr': 'image/exr',
			'.png': 'image/png',
			'.jpg': 'image/jpeg',
			'.jpeg': 'image/jpeg',
			'.bmp': 'image/bmp',
			'.gif': 'image/gif',
			'.webp': 'image/webp',
		}[e] ?? 'image/png'
	)
}

function downsampleData(texture: any, maxSize: number, name?: string): any {
	const { width: w, height: h, data: src } = texture.image
	if (w <= maxSize && h <= maxSize) return texture
	const { data: dst, width: nw, height: nh } = downscaleArray(src, w, h, maxSize, name, texture.type)
	const tex: any = new DataTexture(dst as any, nw, nh, texture.format ?? RGBAFormat)
	tex.colorSpace = texture.colorSpace ?? SRGBColorSpace
	tex.type = texture.type ?? tex.type
	tex.format = texture.format ?? tex.format
	tex.needsUpdate = true
	tex.name = texture.name
	tune(tex, name)
	tex.flipY = texture.flipY ?? false
	texture.dispose?.()
	texture.image.data = null
	return tex
}

export default ThreeTextureLoaderBrowser
