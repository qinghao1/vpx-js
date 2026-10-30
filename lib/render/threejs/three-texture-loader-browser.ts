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
	SRGBColorSpace,
	Texture,
	TextureLoader,
	type Texture as ThreeTexture,
} from '../../refs.browser.js'
import { bitmapCacheKey, exrCacheKey, idbGet, idbSet } from '../../util/idb-cache.js'
import { logger } from '../../util/logger.js'
import { _resetQualityCache, cappedAniso, getEffectiveCaps, MAX_FLOAT_TEXTURE_BYTES } from '../../util/quality.js'
import { settleWorkerEntry, type WorkerPendingEntry } from '../../util/worker-pending.js'
import type { ITextureLoader } from '../irender-api.js'
import { cappedDecodeTarget } from './encoded-size-probe.js'
import { decodeInWorker, hasImageWorker, poolSize } from './image-worker-pool.js'
import { RE_PLAYFIELD } from './material-shared.js'
import { WorkerLoadTracker } from './texture-dispatch.js'
import { downscaleArray } from './texture-downscale.js'
import { isPlayfieldCap } from './texture-tags.js'

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

// Float (HDR/EXR) decode pool: DWAA decodes stall for seconds, so fan out
// across a small dedicated pool (floor 1, cap 2 — unlike
// image-worker-pool.ts sizing; capped frames peak at 128MB for a 4096
// playfield bake, 32MB elsewhere, so two in flight bound memory). Playfield
// bakes take the least-busy worker, the rest stay round-robin (120s timeout;
// slow main-thread parse only as under-cap playfield infra fallback).
const FLOAT_POOL_SIZE = 2
const FLOAT_WORKER_TIMEOUT_MS = 120000
const floatPool: Worker[] = []
let floatNext = 0
let floatSeq = 0
const floatTracker = new WorkerLoadTracker()
const floatPending = new Map<number, WorkerPendingEntry<any> & { worker: Worker; warmup?: boolean }>()

export type FloatInfraCode = 'float-no-worker' | 'float-worker-crash' | 'float-worker-timeout' | 'float-queue-full'

/** Pool outage (no worker, crash, timeout, queue full): `code` survives cloning, unlike instanceof. */
function floatInfraError(code: FloatInfraCode, message: string): Error & { code: FloatInfraCode } {
	return Object.assign(new Error(message), { code })
}

/** Pool outages (no worker, decode timed out, queue full), as opposed to genuine decode failures. */
function isFloatInfraFailure(e: unknown): boolean {
	const code = (e as { code?: unknown })?.code
	return (
		code === 'float-no-worker' ||
		code === 'float-worker-crash' ||
		code === 'float-worker-timeout' ||
		code === 'float-queue-full'
	)
}

// Pending decodes per pool slot before submissions reject fast instead of
// queueing behind a stalled pool.
const FLOAT_PENDING_FACTOR = 2
let floatWarmed = false

function floatPoolSize(): number {
	return poolSize((globalThis as any).navigator?.hardwareConcurrency, FLOAT_POOL_SIZE)
}

/** Fails every entry affine to a dead worker, then terminates and replaces it. */
function failAffine(w: Worker, code: FloatInfraCode, message: string): void {
	const bound: number[] = []
	for (const [id, entry] of floatPending) if (entry.worker === w) bound.push(id)
	replaceFloatWorker(w)
	for (const id of bound) settleWorkerEntry(floatPending, id)?.reject(floatInfraError(code, message))
}

/** A dead worker answers nothing more: fail only its bound entries, then terminate and replace. */
function failFloatWorker(w: Worker, message: string): void {
	failAffine(w, 'float-worker-crash', message)
}

function attachFloatWorker(w: Worker): void {
	w.onmessage = ({ data }: any) => {
		const entry = settleWorkerEntry(floatPending, data.id)
		if (!entry) return
		if (floatPool.includes(w)) floatTracker.idle(w)
		if (data.ok) entry.resolve(data)
		else entry.reject(new Error(data.error ?? 'exr worker failed'))
	}
	w.onerror = (e: any) => {
		failFloatWorker(w, `exr worker crashed: ${e?.error ?? e?.message ?? e}`)
	}
	// Clone/serialization failures on the worker's reply surface here, not on
	// onerror: without this the bound entries hang until the 120s timeout.
	w.onmessageerror = (e: any) => {
		failFloatWorker(w, `exr worker message error: ${e?.data ?? e?.message ?? e}`)
	}
}

function spawnFloatWorker(): Worker | null {
	try {
		const w = new Worker(new URL('./workers/exr-worker.js', import.meta.url), { type: 'module' } as any)
		attachFloatWorker(w)
		return w
	} catch {
		return null
	}
}

function ensureFloatPool(): Worker[] | null {
	if (typeof Worker === 'undefined') return null
	// Top up to target size: a replace-shrink (spawn failed mid-replace)
	// regrows here instead of running degraded forever.
	while (floatPool.length < floatPoolSize()) {
		const w = spawnFloatWorker()
		if (!w) break
		floatPool.push(w)
	}
	return floatPool.length ? floatPool : null
}

/** Terminates a dead worker, drops its load, and splices in a live replacement. */
function replaceFloatWorker(dead: Worker): void {
	const slot = floatPool.indexOf(dead)
	floatTracker.drop(dead)
	try {
		dead.terminate()
	} catch {}
	if (slot < 0) return
	const fresh = spawnFloatWorker()
	if (fresh) floatPool[slot] = fresh
	else floatPool.splice(slot, 1)
}

function parseWorker(
	buffer: ArrayBuffer,
	kind: 'exr' | 'hdr',
	max?: number,
	name?: string,
	warmup = false,
): Promise<any> {
	const pool = ensureFloatPool()
	if (!pool?.length) return Promise.reject(floatInfraError('float-no-worker', 'no worker'))
	// Table-load bursts must reject fast with a typed error instead of
	// growing the pending map (and worker backlogs) without bound. Warmup
	// decodes never count: a burst racing warmup must not trip the cap.
	if (!warmup) {
		let queued = 0
		for (const entry of floatPending.values()) if (!entry.warmup) queued++
		const maxPending = pool.length * FLOAT_PENDING_FACTOR
		if (queued >= maxPending)
			return Promise.reject(
				floatInfraError('float-queue-full', `exr worker queue full (${queued} pending, cap ${maxPending})`),
			)
	}
	// Playfield maps take the least-busy worker (same decode either way);
	// round-robin resumes where it left off.
	const picked = floatTracker.pick(pool, isPlayfieldCap(name), floatNext)
	floatNext = picked.next
	const w = picked.worker
	const id = ++floatSeq
	return new Promise((resolve, reject) => {
		const entry: WorkerPendingEntry<any> & { worker: Worker; warmup?: boolean } = { resolve, reject, worker: w }
		if (warmup) entry.warmup = true
		floatPending.set(id, entry)
		// A hung worker answers nothing more — not just this call: fail every
		// entry bound to it, then terminate and replace.
		entry.timer = setTimeout(() => {
			failAffine(w, 'float-worker-timeout', 'exr worker timeout')
		}, FLOAT_WORKER_TIMEOUT_MS)
		try {
			floatTracker.busy(w)
			w.postMessage({ id, buffer, type: kind, max, name }, [buffer] as any)
		} catch (e) {
			// A worker that cannot even take a post is suspect: terminate and
			// replace it so the crash-code retry below can't land back on the
			// dead worker (a fresh pick may use the other live worker).
			if (settleWorkerEntry(floatPending, id)) floatTracker.idle(w)
			replaceFloatWorker(w)
			reject(floatInfraError('float-worker-crash', `exr worker post failed: ${(e as Error)?.message ?? e}`))
		}
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

/** Minimal 1x1 flat (non-RLE: width < 8) Radiance frame: parses in microseconds, warms module load + JIT. */
function tinyHdrBuffer(): ArrayBuffer {
	const head = new TextEncoder().encode('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 1 +X 1\n')
	const bytes = new Uint8Array(head.length + 4)
	bytes.set(head, 0)
	bytes.set([1, 1, 1, 128], head.length)
	return bytes.buffer
}

export class ThreeTextureLoaderBrowser implements ITextureLoader<ThreeTexture> {
	public playfieldMap?: string

	/**
	 * Fire-and-forget float-pool spawn so worker startup overlaps VPX parsing
	 * instead of serializing behind the first float texture, plus one tiny
	 * decode per worker to warm module load + JIT. The map generator kicks
	 * this before dispatch; no-op without Worker and after the first kick.
	 */
	public warmup(): void {
		const pool = ensureFloatPool()
		if (!pool?.length || floatWarmed) return
		floatWarmed = true
		// One tiny decode per worker: consecutive round-robin picks land on
		// distinct workers, so each warms its module load + JIT. Rejections
		// stay observed here; the entries resolve in microseconds.
		for (let i = 0; i < pool.length; i++)
			parseWorker(tinyHdrBuffer(), 'hdr', undefined, undefined, true).catch(() => {})
	}

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
		// WebGPU has no RGB8 texture format, so raw bitmaps always upload
		// RGBA; with all-1.0 alpha the sample is identical.
		const tex: any = new DataTexture(data as any, width, height, RGBAFormat)
		tex.flipY = true
		tex.colorSpace = SRGBColorSpace
		tex.needsUpdate = true
		return finalize(tex, name, false)
	}

	public async loadTexture(name: string, ext: string, data: Uint8Array): Promise<ThreeTexture> {
		const mime = getMimeType(data, ext) ?? 'image/png'
		const isHdr = mime === 'image/hdr' || ext === '.hdr'
		const isExr = mime === 'image/exr' || ext === '.exr'
		// Regular images always try the worker pool first — even giants: the
		// bytes are transferred and the worker decodes at the capped size,
		// so a 20MB playfield never materializes a full-res frame on the
		// main thread. Main-thread createImageBitmap is the last resort.
		if (!isHdr && !isExr) {
			if (hasImageWorker()) {
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
			const overCap = data.byteLength > MAX_FLOAT_TEXTURE_BYTES
			try {
				const viaWorker = await tryLoadViaWorker(name, kind, data)
				if (viaWorker) return viaWorker
			} catch (e) {
				// The worker OOM bound rejects huge payloads before decode, but
				// playfield lightmap bakes gate playfield brightness: a missing
				// nestmap leaves the GI overlays mapless and the playfield dark.
				// Let those fall through to the slow main-thread parse with a
				// single warning; every other worker failure still throws. Pool
				// outages qualify only under the worker cap — an over-cap
				// playfield whose worker OOMs must throw (let the map generator
				// skip) instead of running the main-thread full-res slow parse,
				// the exact 512MB expansion the cap prevents.
				// Dead defense (unreachable): both "too large" producers exempt playfields.
				const sizeFallback = isFloatSizeRejection(e) && isPlayfieldCap(name)
				const outageFallback = isPlayfieldCap(name) && !overCap && isFloatInfraFailure(e)
				if (!sizeFallback && !outageFallback) throw e
				logger().warn(
					'[ThreeTextureLoaderBrowser.loadTexture] Float texture %s slow main-thread decode (%sMB%s)',
					name,
					(data.byteLength / 1048576).toFixed(1),
					overCap
						? ` > ${(MAX_FLOAT_TEXTURE_BYTES / 1048576).toFixed(0)}MB worker cap`
						: ' after pool outage',
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

/**
 * Codec-level scaled decode, mirroring the image-decode worker's middle
 * tier (Chromium/FF only): sizing lives in the ImageDecoder constructor.
 * Throws when unsupported so callers fall through to the two-step path —
 * Safari has no ImageDecoder and keeps CIB-at-size → two-step.
 */
async function decodeMainAtSize(
	data: Uint8Array,
	mime: string,
	target: { width: number; height: number },
): Promise<any> {
	const Decoder = (globalThis as any).ImageDecoder
	if (typeof Decoder === 'undefined') throw new Error('no ImageDecoder')
	try {
		if (typeof Decoder.isTypeSupported === 'function' && !(await Decoder.isTypeSupported(mime))) {
			throw new Error(`ImageDecoder cannot decode ${mime}`)
		}
	} catch (e: any) {
		if (/cannot decode/.test(e?.message ?? '')) throw e
	}
	const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
	const decoder = new Decoder({ data: buf, type: mime, desiredWidth: target.width, desiredHeight: target.height })
	try {
		const { image } = (await decoder.decode()) as any
		try {
			return await createImageBitmap(
				image as any,
				{
					imageOrientation: 'flipY',
					premultiplyAlpha: 'none',
					colorSpaceConversion: 'none',
				} as any,
			).catch(() => createImageBitmap(image as any))
		} finally {
			try {
				image.close?.()
			} catch {}
		}
	} finally {
		try {
			decoder.close?.()
		} catch {}
	}
}

async function tryCreateBitmap(data: Uint8Array, mime: string, name: string): Promise<ThreeTexture | null> {
	try {
		const blob = new Blob([toBlobPart(data) as any], { type: mime as any })
		const max = effectiveMax(false, name)
		// Decode-at-size: single-step decode+downscale, no full-res
		// intermediate. Falls through to the two-step path when the codec
		// ignores resize options.
		const target = cappedDecodeTarget(data, max)
		let sized: any = null
		if (target) {
			try {
				const single: any = await createImageBitmap(
					blob as any,
					{
						imageOrientation: 'flipY',
						premultiplyAlpha: 'none',
						colorSpaceConversion: 'none',
						resizeWidth: target.width,
						resizeHeight: target.height,
						resizeQuality: 'high',
					} as any,
				)
				// The codec may ignore resize options: only take the fast
				// path when the bitmap came back within cap.
				if (single.width <= max && single.height <= max) return textureFromBitmap(single, name)
				sized = single
			} catch {
				logger().debug(
					'[ThreeTextureLoaderBrowser.tryCreateBitmap] single-step decode-at-size failed for "%s", falling through',
					name,
				)
			}
			// The codec ignored the resize hint: try ImageDecoder at size
			// before the two-step resize reuses this bitmap. No ImageDecoder
			// (Safari, node) throws inside and keeps the old path.
			if (sized && (sized.width > max || sized.height > max)) {
				try {
					const decoded: any = await decodeMainAtSize(data, mime, target)
					try {
						sized.close?.()
					} catch {}
					sized = decoded
				} catch {
					logger().debug(
						'[ThreeTextureLoaderBrowser.tryCreateBitmap] ImageDecoder at-size decode failed for "%s", falling through',
						name,
					)
				}
			}
		}
		// Flags match three's upload path (non-premultiplied, no browser
		// conversion); resizeQuality stays explicit — the default is 'low'.
		// Display-P3 sources tagged sRGB render slightly muted, but 'none' keeps uploads deterministic.
		let bitmap: any = sized
		if (!bitmap) {
			bitmap = await createImageBitmap(
				blob as any,
				{
					imageOrientation: 'flipY',
					premultiplyAlpha: 'none',
					colorSpaceConversion: 'none',
				} as any,
			)
		}
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
				// Bitmap-source resize is best-effort per engine: a still-over-cap
				// frame falls through to the TextureLoader path instead of escaping.
				if (bitmap.width > max || bitmap.height > max) {
					try {
						bitmap.close?.()
					} catch {}
					return null
				}
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
	// Over-cap playfield bakes skip the IDB round-trip (the content hash plus
	// the structured clone of a capped frame — up to 128MB at the 4096
	// playfield cap — would itself stall the main thread) and go straight to
	// the pool, which absorbs the slow parse.
	const overCap = data.byteLength > MAX_FLOAT_TEXTURE_BYTES
	const key = overCap ? null : exrCacheKey(name, data, kind, max)
	if (key) {
		const cached: any = await idbGet(key)
		if (cached?.width && cached?.data) {
			return finalize(
				floatTex(cached.width, cached.height, cached.data, cached.type, cached.format, cached.colorSpace),
				name,
				true,
			)
		}
	}
	// Bound the worst case before touching the worker: EXR/HDR decoders expand
	// to a full-res half-float frame first (8192x8192 RGBA16F is 512MB) and
	// downsample only afterwards, so an uncapped decode OOMs or stalls. Fail
	// fast with 'too large' so the map generator skips the texture on its
	// debug path and the failure cooldown absorbs demand retries. Playfield
	// bakes are exempt: the pool decodes them off the main thread, and a
	// worker-side OOM kills only the worker, not the tab.
	if (overCap && !isPlayfieldCap(name)) {
		throw new Error(
			`Float texture "${name}" is too large to decode ` +
				`(${(data.byteLength / 1048576).toFixed(1)}MB > ${MAX_FLOAT_TEXTURE_BYTES / 1048576}MB cap): ` +
				`skipped before worker decode`,
		)
	}
	const slice = () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
	let parsed: any
	try {
		parsed = await parseWorker(slice(), kind, max, name)
	} catch (e) {
		// A crashed worker is already terminated-and-replaced above: retry the
		// failed decode once (re-picked off the dead worker). Timeouts never
		// retry — a hung (usually DWAA) source would likely re-hang.
		if ((e as { code?: unknown })?.code !== 'float-worker-crash') throw e
		parsed = await parseWorker(slice(), kind, max, name)
	}
	if (parsed?.width && parsed?.data) {
		if (key) {
			idbSet(key, {
				width: parsed.width,
				height: parsed.height,
				data: parsed.data,
				type: parsed.type,
				format: parsed.format,
				colorSpace: parsed.colorSpace,
			}).catch(() => {})
		}
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

async function loadFloatFallback(name: string, ext: string, mime: string, data: Uint8Array): Promise<ThreeTexture> {
	// Playfield fallback (no worker, or the pool failed a playfield bake):
	// EXR/HDR parse is monolithic, so no in-parse yield is possible — yield
	// once up front so pending UI work flushes before the block.
	await new Promise<void>(resolve => setTimeout(resolve, 0))
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
