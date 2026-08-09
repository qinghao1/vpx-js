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

function maxFor(name: string, w: number, h: number, isFloat: boolean, playfieldMap?: string): number {
	const lower = name.toLowerCase()
	if (playfieldMap && lower === playfieldMap.toLowerCase()) return MAX_PLAYFIELD
	if (lower.includes('vlm.nestmap')) return MAX_VLM
	if (isFloat) return w <= 512 && h <= 512 ? Math.max(w, h) : MAX_FLOAT
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

function getCanvas(w: number, h: number): any {
	if (typeof OffscreenCanvas !== 'undefined') {
		try {
			return new (OffscreenCanvas as any)(w, h)
		} catch {}
	}
	if (typeof document !== 'undefined' && typeof (document as any).createElement === 'function') {
		const c = (document as any).createElement('canvas')
		c.width = w
		c.height = h
		return c
	}
	return null
}

function stepwiseCanvasDownscale(source: any, sW: number, sH: number, dW: number, dH: number): any | null {
	let curSource: any = source
	let curW = sW
	let curH = sH
	let curCanvas: any = null
	try {
		while (curW > dW * 2 || curH > dH * 2) {
			const nextW = Math.max(dW, Math.floor(curW / 2))
			const nextH = Math.max(dH, Math.floor(curH / 2))
			if (nextW >= curW && nextH >= curH) break
			const canvas: any = getCanvas(nextW, nextH)
			if (!canvas) return null
			canvas.width = nextW
			canvas.height = nextH
			const ctx: any = canvas.getContext('2d')
			if (!ctx) return null
			try {
				ctx.imageSmoothingEnabled = true
				;(ctx as any).imageSmoothingQuality = 'high'
			} catch {}
			try {
				ctx.drawImage(curSource, 0, 0, curW, curH, 0, 0, nextW, nextH)
			} catch {
				try {
					ctx.drawImage(curSource, 0, 0, nextW, nextH)
				} catch {
					return null
				}
			}
			curSource = canvas
			curCanvas = canvas
			curW = nextW
			curH = nextH
		}
		if (curCanvas && curW === dW && curH === dH) return curCanvas
		if (curW === dW && curH === dH && !curCanvas) {
			if (
				curSource instanceof HTMLCanvasElement ||
				(typeof OffscreenCanvas !== 'undefined' && curSource instanceof (OffscreenCanvas as any))
			) {
				return curSource
			}
		}
		const finalCanvas: any = getCanvas(dW, dH)
		if (!finalCanvas) return null
		finalCanvas.width = dW
		finalCanvas.height = dH
		const ctx: any = finalCanvas.getContext('2d')
		if (!ctx) return null
		try {
			ctx.imageSmoothingEnabled = true
			;(ctx as any).imageSmoothingQuality = 'high'
		} catch {}
		try {
			ctx.drawImage(curSource, 0, 0, curW, curH, 0, 0, dW, dH)
		} catch {
			try {
				ctx.drawImage(curSource, 0, 0, dW, dH)
			} catch {
				return null
			}
		}
		return finalCanvas
	} catch {
		return null
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
			let curBmp: any = bitmap
			let curW = bitmap.width
			let curH = bitmap.height
			let useCanvasFallback = false
			while (curW > nw * 2 || curH > nh * 2) {
				const nextW = Math.max(nw, Math.floor(curW / 2))
				const nextH = Math.max(nh, Math.floor(curH / 2))
				if (nextW >= curW && nextH >= curH) break
				try {
					const nextBmp: any = await (createImageBitmap as any)(curBmp, {
						resizeWidth: nextW,
						resizeHeight: nextH,
						resizeQuality: 'high',
					} as any)
					try {
						curBmp.close?.()
					} catch {}
					curBmp = nextBmp
					curW = nextW
					curH = nextH
				} catch {
					useCanvasFallback = true
					break
				}
			}
			if (!useCanvasFallback && (curW !== nw || curH !== nh)) {
				try {
					const finalBmp: any = await (createImageBitmap as any)(curBmp, {
						resizeWidth: nw,
						resizeHeight: nh,
						resizeQuality: 'high',
					} as any)
					try {
						curBmp.close?.()
					} catch {}
					curBmp = finalBmp
				} catch {
					useCanvasFallback = true
				}
			}
			if (useCanvasFallback) {
				const canvas: any = stepwiseCanvasDownscale(curBmp, curW, curH, nw, nh)
				try {
					curBmp.close?.()
				} catch {}
				try {
					bitmap.close?.()
				} catch {}
				if (canvas) {
					const tex: any = new CanvasTexture(canvas as any)
					tex.colorSpace = SRGBColorSpace
					tex.flipY = false
					tex.needsUpdate = true
					tune(tex)
					tex.name = `texture:${name}`
					return tex
				}
			} else {
				bitmap = curBmp
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
	const tex: any = await loadViaUrl(url)
	tex.colorSpace = SRGBColorSpace
	return finalize(tex, name, false, playfieldMap)
}

function loadViaUrl(url: string): Promise<ThreeTexture> {
	return new Promise((resolve, reject) => {
		new TextureLoader().load(
			url,
			(tex: any) => {
				URL.revokeObjectURL(url)
				resolve(tex as ThreeTexture)
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
	const nw = Math.max(1, Math.floor(w * scale))
	const nh = Math.max(1, Math.floor(h * scale))
	const channels = Math.round(src.length / (w * h)) || 4
	const dst: any = new (src.constructor as any)(nw * nh * channels)
	const xRatio = w / nw
	const yRatio = h / nh
	const isHalf = src instanceof Uint16Array && texture.type === HalfFloatType
	const isFloat = src instanceof Float32Array
	if (isHalf) {
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
							sum += DataUtils.fromHalfFloat(src[row + sx * channels + c] as any)
					}
					dst[dBase + c] = DataUtils.toHalfFloat(sum / count)
				}
			}
		}
	} else if (isFloat) {
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
						for (let sx = x0; sx < x1; sx++) sum += (src as Float32Array)[row + sx * channels + c]!
					}
					dst[dBase + c] = sum / count
				}
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
						for (let sx = x0; sx < x1; sx++) sum += (src as any)[row + sx * channels + c]
					}
					dst[dBase + c] = Math.round(sum / count)
				}
			}
		}
	}
	const tex: any = new DataTexture(dst as any, nw, nh, texture.format ?? RGBAFormat)
	tex.colorSpace = texture.colorSpace ?? SRGBColorSpace
	tex.mapping = texture.mapping ?? tex.mapping
	tex.type = texture.type ?? tex.type
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
	const nw = Math.max(1, Math.floor(w * scale))
	const nh = Math.max(1, Math.floor(h * scale))
	const hasOffscreen = typeof OffscreenCanvas !== 'undefined'
	const hasDocument = typeof document !== 'undefined' && typeof (document as any).createElement === 'function'
	if (!hasOffscreen && !hasDocument) return texture
	const img: any = texture.image
	if (!img) return texture
	const isDrawable =
		(typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement) ||
		(typeof HTMLCanvasElement !== 'undefined' && img instanceof HTMLCanvasElement) ||
		(typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) ||
		(hasOffscreen && img instanceof (OffscreenCanvas as any)) ||
		(typeof HTMLVideoElement !== 'undefined' && img instanceof HTMLVideoElement)
	if (!isDrawable && !(img.width && img.height)) return texture
	try {
		const canvas: any = stepwiseCanvasDownscale(img, w, h, nw, nh)
		if (!canvas) return texture
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
	} catch {
		return texture
	}
}
