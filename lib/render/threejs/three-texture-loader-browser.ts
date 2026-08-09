// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import {
	CanvasTexture,
	ClampToEdgeWrapping,
	DataTexture,
	DataUtils,
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
}

const MAX_REGULAR = 4096
const MAX_FLOAT = 2048
const MAX_PLAYFIELD = 4096
const MAX_VLM = 1024

function tune(tex: any): void {
	tex.generateMipmaps = true
	tex.minFilter = LinearMipMapLinearFilter
	tex.magFilter = LinearFilter
	tex.anisotropy = 16
}

function nameAndTune(tex: any, name: string): void {
	tex.name = `texture:${name}`
	tex.needsUpdate = true
	tune(tex)
}

function maxFor(name: string, isFloat: boolean, playfieldMap?: string): number {
	const lower = name.toLowerCase()
	if (playfieldMap && lower === playfieldMap.toLowerCase()) return MAX_PLAYFIELD
	if (lower.includes('vlm.nestmap')) return MAX_VLM
	return isFloat ? MAX_FLOAT : MAX_REGULAR
}

function finalize(tex: any, name: string, isFloat: boolean, playfieldMap?: string): any {
	const max = maxFor(name, isFloat, playfieldMap)
	if (tex.image?.data && tex.image.width && tex.image.height) {
		const ds = downsampleData(tex, max)
		if (ds !== tex) {
			try {
				tex.dispose?.()
			} catch {}
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
	if (typeof Worker === 'undefined' || worker) return worker
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

function parseWorker(buffer: ArrayBuffer, kind: 'exr' | 'hdr'): Promise<any> {
	const w = getWorker()
	if (!w) return Promise.reject(new Error('no worker'))
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
		const keyLc = fileName.slice(0, fileName.lastIndexOf('.')).toLowerCase()
		if (keyLc === 'ball') return createBallEnvTexture(_name || fileName)
		const key = fileName.slice(0, fileName.lastIndexOf('.'))
		const url = imageMap[key]
		if (!url) throw new Error(`Unknown local texture "${key}".`)
		const tex: any = await new TextureLoader().loadAsync(url)
		return finalize(tex, _name || fileName, false, this.playfieldMap)
	}

	public async loadRawTexture(name: string, data: Uint8Array, width: number, height: number): Promise<ThreeTexture> {
		const tex: any = new DataTexture(data as any, width, height, RGBAFormat as any)
		tex.flipY = true
		tex.colorSpace = SRGBColorSpace
		tex.needsUpdate = true
		return finalize(tex, name, false, this.playfieldMap)
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
			const viaWorker = await tryLoadViaWorker(name, kind, data, this.playfieldMap)
			if (viaWorker) return viaWorker
			return loadFloatFallback(name, ext, mime, data, this.playfieldMap)
		}

		return loadRegular(name, mime, data, this.playfieldMap)
	}
}

// Procedural equirect env for the chrome ball. POT 256×128, no mipmaps and
// ClampToEdge avoids SwiftShader failure with NPOT + Repeat + mips
// (previous 116×116 ball.png caused PMREMGGXConvolution 1282).
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
	bg.addColorStop(0, '#8fa0bc')
	bg.addColorStop(0.22, '#d6deea')
	bg.addColorStop(0.5, '#f1f4f8')
	bg.addColorStop(0.72, '#a8b0c2')
	bg.addColorStop(1, '#2a3142')
	ctx.fillStyle = bg
	ctx.fillRect(0, 0, w, h)
	const rg = ctx.createRadialGradient(w * 0.46, h * 0.38, 2, w * 0.46, h * 0.38, 42)
	rg.addColorStop(0, 'rgba(255,255,255,0.95)')
	rg.addColorStop(0.35, 'rgba(255,255,255,0.45)')
	rg.addColorStop(1, 'rgba(255,255,255,0)')
	ctx.fillStyle = rg
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
		const max = maxFor(name, false, playfieldMap)
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
			return finalize(floatTex(cached.width, cached.height, cached.data, cached.type, cached.format, cached.colorSpace), name, true, playfieldMap)
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
			return finalize(floatTex(parsed.width, parsed.height, parsed.data, parsed.type, parsed.format, parsed.colorSpace), name, true, playfieldMap)
		}
	} catch {}
	return null
}

function floatTex(width: number, height: number, data: any, type: any, format: any, colorSpace: any): ThreeTexture {
	const tex: any = new DataTexture(data as any, width, height, format ?? (RGBAFormat as any), type ?? (HalfFloatType as any))
	tex.flipY = false
	tex.colorSpace = colorSpace ?? LinearSRGBColorSpace
	tex.needsUpdate = true
	return tex as ThreeTexture
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
		tex.colorSpace = LinearSRGBColorSpace
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
		const tex: any = await new TextureLoader().loadAsync(url)
		tex.colorSpace = SRGBColorSpace
		return finalize(tex, name, false, playfieldMap)
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

function downsampleData(texture: any, maxSize: number): any {
	const { width: w, height: h, data: src } = texture.image
	if (w <= maxSize && h <= maxSize) return texture
	const scale = Math.min(maxSize / w, maxSize / h)
	const nw = Math.max(1, Math.floor(w * scale))
	const nh = Math.max(1, Math.floor(h * scale))
	const channels = Math.round(src.length / (w * h)) || 4
	const dst: any = new (src.constructor as any)(nw * nh * channels)
	const xRatio = w / nw
	const yRatio = h / nh
	const isHalf = src instanceof Uint16Array && texture.type === HalfFloatType
	const isFloat = src instanceof Float32Array
	for (let y = 0; y < nh; y++) {
		const y0 = Math.floor(y * yRatio)
		const y1 = Math.min(h, Math.ceil((y + 1) * yRatio))
		for (let x = 0; x < nw; x++) {
			const x0 = Math.floor(x * xRatio)
			const x1 = Math.min(w, Math.ceil((x + 1) * xRatio))
			const count = (x1 - x0) * (y1 - y0)
			const dBase = (y * nw + x) * channels
			for (let c = 0; c < channels; c++) {
				let sum = 0
				for (let sy = y0; sy < y1; sy++) {
					const row = sy * w * channels
					for (let sx = x0; sx < x1; sx++) sum += isHalf ? DataUtils.fromHalfFloat(src[row + sx * channels + c] as any) : (src as any)[row + sx * channels + c]
				}
				const avg = sum / count
				dst[dBase + c] = isHalf ? DataUtils.toHalfFloat(avg) : isFloat ? avg : Math.round(avg)
			}
		}
	}
	const tex: any = new DataTexture(dst as any, nw, nh, texture.format ?? RGBAFormat)
	tex.colorSpace = texture.colorSpace ?? SRGBColorSpace
	tex.type = texture.type ?? tex.type
	tex.format = texture.format ?? tex.format
	tex.needsUpdate = true
	tex.name = texture.name
	tune(tex)
	tex.flipY = texture.flipY ?? false
	try {
		texture.dispose?.()
	} catch {}
	try {
		texture.image.data = null
	} catch {}
	return tex
}
