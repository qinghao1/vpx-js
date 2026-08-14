// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import {
	CanvasTexture,
	ClampToEdgeWrapping,
	DataTexture,
	Texture,
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

let hwMax: number | undefined
let isSwiftShaderCache: boolean | undefined
function isSwiftShader(): boolean {
	if (isSwiftShaderCache !== undefined) return isSwiftShaderCache
	try {
		if (typeof document === 'undefined') return (isSwiftShaderCache = false)
		const c = document.createElement('canvas')
		const gl = (c.getContext('webgl2') ?? c.getContext('webgl') ?? c.getContext('experimental-webgl')) as any
		if (!gl) return (isSwiftShaderCache = false)
		const ext = gl.getExtension('WEBGL_debug_renderer_info')
		const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''
		const s = String(renderer || '').toLowerCase()
		return (isSwiftShaderCache = s.includes('swiftshader') || s.includes('swift shader'))
	} catch {
		return (isSwiftShaderCache = false)
	}
}
function getHardwareMax(): number {
	if (hwMax !== undefined) return hwMax
	try {
		if (typeof document === 'undefined') return (hwMax = 4096)
		const c = document.createElement('canvas')
		const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as any
		const v = gl?.getParameter(gl?.MAX_TEXTURE_SIZE)
		return (hwMax = typeof v === 'number' && v >= 1024 ? v : 4096)
	} catch {
		return (hwMax = 4096)
	}
}

function viewportBudget(): number {
	try {
		if (typeof window === 'undefined' || !window.innerWidth) return getHardwareMax()
		return Math.max(window.innerWidth, window.innerHeight) * (window.devicePixelRatio || 1)
	} catch {
		return getHardwareMax()
	}
}

export function effectiveMax(isFloat: boolean, name?: string): number {
	const hw = getHardwareMax()
	const swift = isSwiftShader()
	const isPlayfield = !!name && /playfield|nestmap|bake/i.test(name)
	const cap = isPlayfield ? 4096 : swift ? 2048 : 4096
	if (isFloat) {
		if (isPlayfield) return cap
		return Math.min(hw, cap, Math.max(1024, Math.ceil(viewportBudget())))
	}
	return Math.min(hw, cap)
}

export function _testResetTextureLimits(): void {
	hwMax = undefined
	isSwiftShaderCache = undefined
}

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

function bitmapToCanvasTexture(bitmap: any, name: string): any {
	try {
		if (typeof document === 'undefined' || !bitmap?.width || !bitmap?.height) return null
		const canvas: any = document.createElement('canvas')
		canvas.width = bitmap.width
		canvas.height = bitmap.height
		const ctx: any = canvas.getContext('2d')
		if (!ctx) return null
		ctx.drawImage(bitmap as any, 0, 0, bitmap.width, bitmap.height)
		try { bitmap.close?.() } catch {}
		const tex: any = new CanvasTexture(canvas)
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

function finalize(tex: any, name: string, isFloat: boolean): any {
	if (tex?.image && typeof (tex.image as any).close === 'function' && (tex.image as any).width) {
		try {
			const img: any = tex.image
			const isBitmap = typeof ImageBitmap !== 'undefined' ? img instanceof ImageBitmap : false
			const looksBitmap = isBitmap || (typeof img.width === 'number' && typeof img.height === 'number' && typeof img.close === 'function')
			if (looksBitmap) {
				const conv = bitmapToCanvasTexture(img, name)
				if (conv) {
					try { tex.dispose?.() } catch {}
					tex = conv
				}
			}
		} catch {}
	}
	const max = effectiveMax(isFloat, name)
	if (tex.image?.data && tex.image.width && tex.image.height) {
		const ds = downsampleData(tex, max, name)
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
		return finalize(tex, _name || fileName, false)
	}

	public async loadRawTexture(name: string, data: Uint8Array, width: number, height: number): Promise<ThreeTexture> {
		const tex: any = new DataTexture(data as any, width, height, RGBAFormat as any)
		tex.flipY = true
		tex.colorSpace = SRGBColorSpace
		tex.needsUpdate = true
		return finalize(tex, name, false)
	}

	public async loadTexture(name: string, ext: string, data: Uint8Array): Promise<ThreeTexture> {
		const mime = getMimeType(data, ext) ?? 'image/png'
		const isHdr = mime === 'image/hdr' || ext === '.hdr'
		const isExr = mime === 'image/exr' || ext === '.exr'
		const tooLarge = data.byteLength > 16 * 1024 * 1024
		if (!isHdr && !isExr && !tooLarge && typeof createImageBitmap !== 'undefined') {
			const bmp = await tryCreateBitmap(data, mime, name)
			if (bmp) return bmp
		}
		if (isHdr || isExr) {
			const kind = isExr ? ('exr' as const) : ('hdr' as const)
			const viaWorker = await tryLoadViaWorker(name, kind, data)
			if (viaWorker) return viaWorker
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
		const blob = new Blob(
			[
				data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
					? (data as any)
					: (data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as any),
			],
			{ type: mime as any },
		)
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
		const tex: any = new Texture(bitmap as any)
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

async function tryLoadViaWorker(name: string, kind: 'exr' | 'hdr', data: Uint8Array): Promise<ThreeTexture | null> {
	const key = exrCacheKey(name, data.byteLength, kind)
	try {
		const cached: any = await idbGet(key)
		if (cached?.width && cached?.data) {
			return finalize(
				floatTex(cached.width, cached.height, cached.data, cached.type, cached.format, cached.colorSpace),
				name,
				true,
			)
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
			return finalize(
				floatTex(parsed.width, parsed.height, parsed.data, parsed.type, parsed.format, parsed.colorSpace),
				name,
				true,
			)
		}
	} catch {}
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
	const blobPart: any =
		data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
			? data
			: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
	const url = URL.createObjectURL(new Blob([blobPart as any], { type: mime as any }))
	try {
		const tex: any = await new TextureLoader().loadAsync(url)
		tex.colorSpace = SRGBColorSpace
		const img: any = tex.image
		const max = effectiveMax(false, name)
		if (img && typeof img.width === 'number' && typeof img.height === 'number' && (img.width > max || img.height > max) && typeof document !== 'undefined') {
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
					tune(cTex)
					try { tex.dispose?.() } catch {}
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
	const scale = Math.min(maxSize / w, maxSize / h)
	const nw = Math.max(1, Math.floor(w * scale))
	const nh = Math.max(1, Math.floor(h * scale))
	const channels = Math.round(src.length / (w * h)) || 4
	const dst: any = new (src.constructor as any)(nw * nh * channels)
	const xRatio = w / nw
	const yRatio = h / nh
	const isHalf = src instanceof Uint16Array && texture.type === HalfFloatType
	const isFloat = src instanceof Float32Array
	const isPlayfield = !!name && /playfield|nestmap|bake/i.test(name)
	const fast = !isPlayfield && w * h > 4 * 1024 * 1024
	if (fast) {
		for (let y = 0; y < nh; y++) {
			const sy = Math.min(h - 1, Math.floor(y * yRatio))
			const srcRow = sy * w * channels
			const dstRow = y * nw * channels
			for (let x = 0; x < nw; x++) {
				const sx = Math.min(w - 1, Math.floor(x * xRatio))
				const sBase = srcRow + sx * channels
				const dBase = dstRow + x * channels
				for (let c = 0; c < channels; c++) dst[dBase + c] = (src as any)[sBase + c]
			}
		}
	} else {
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
						for (let sx = x0; sx < x1; sx++)
							sum += isHalf
								? DataUtils.fromHalfFloat(src[row + sx * channels + c] as any)
								: (src as any)[row + sx * channels + c]
					}
					const avg = sum / count
					dst[dBase + c] = isHalf ? DataUtils.toHalfFloat(avg) : isFloat ? avg : Math.round(avg)
				}
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
