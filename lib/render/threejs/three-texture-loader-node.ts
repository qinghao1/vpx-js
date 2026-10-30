// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { availableParallelism } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { inflate as zlibInflateCb } from 'node:zlib'
import { DataTexture, LinearSRGBColorSpace, RGBAFormat, SRGBColorSpace, type Texture as ThreeTexture } from 'three'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import { logger } from '../../util/logger.js'
import { MAX_FLOAT_TEXTURE_BYTES } from '../../util/quality.js'
import { settleWorkerEntry, type WorkerPendingEntry, withWorkerTimeout } from '../../util/worker-pending.js'
import type { ITextureLoader } from '../irender-api.js'
import { WorkerLoadTracker } from './texture-dispatch.js'
import { boxWindowGeometry, downscaleArray } from './texture-downscale.js'
import { getMaxTextureSize, isPlayfieldCap } from './texture-tags.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

let hdrWorkers: any[] = []
let hdrReady: Promise<any[]> | null = null
const hdrPending = new Map<number, WorkerPendingEntry>()
const hdrTracker = new WorkerLoadTracker()
let hdrNextId = 1
let hdrNextWorker = 0
/**
 * HDR/EXR decode workers. DWAA-compressed 8192px playfield bakes decode for
 * ~15s each on one thread, so a 2-worker pool serializes the third float
 * texture behind them (round-robin FIFO per worker). Size with CPU count —
 * floor 2 (past behavior on unknown hardware), cap 4 (each 8192px decode
 * peaks near 1GB, matching the map generator's concurrency cap).
 */
const HDR_POOL_SIZE = (() => {
	try {
		const n = typeof availableParallelism === 'function' ? availableParallelism() : 2
		return Math.min(4, Math.max(2, n))
	} catch {
		return 2
	}
})()

async function getHdrWorkers(): Promise<any[]> {
	if (hdrWorkers.length) return hdrWorkers
	if (hdrReady) return hdrReady
	hdrReady = (async () => {
		const { Worker } = await import('node:worker_threads')
		const { existsSync } = await import('node:fs')
		const workers: any[] = []
		for (let i = 0; i < HDR_POOL_SIZE; i++) {
			const tryCreate = (url: URL, withTsx: boolean) => {
				try {
					if (withTsx) return new Worker(url as any, { execArgv: ['--import', 'tsx/esm'] } as any)
					return new Worker(url as any)
				} catch {
					return null
				}
			}
			let w: any = null
			for (const [p, tsx] of [
				[`./hdr-decode.worker.node.js`, false],
				[`./hdr-decode.worker.node.js`, true],
				[`./hdr-decode.worker.node.ts`, true],
			] as const) {
				const u = new URL(p, import.meta.url) as any
				if (!existsSync(fileURLToPath(u))) continue
				w = tryCreate(u, tsx)
				if (w) break
			}
			if (!w) throw new Error('hdr worker not available - expected ./hdr-decode.worker.node.js')
			w.on('message', (m: any) => {
				const entry = settleWorkerEntry(hdrPending, m.id)
				if (!entry) return
				hdrTracker.idle(w)
				m.ok ? entry.resolve(m) : entry.reject(new Error(m.error))
			})
			w.on('error', (e: any) => {
				hdrTracker.resetAll()
				for (const [, entry] of hdrPending) {
					if (entry.timer) clearTimeout(entry.timer)
					entry.reject(e)
				}
				hdrPending.clear()
			})
			w.on('exit', () => {
				hdrTracker.drop(w)
				// Survivor counts are stale for the rejected calls below, so
				// zero them rather than biasing least-busy dispatch.
				hdrTracker.resetAll()
				hdrWorkers = hdrWorkers.filter(x => x !== w)
				if (!hdrWorkers.length) hdrReady = null
				for (const [, entry] of hdrPending) {
					if (entry.timer) clearTimeout(entry.timer)
					entry.reject(new Error('hdr worker exited'))
				}
				hdrPending.clear()
			})
			;(w as any).unref?.()
			workers.push(w)
		}
		hdrWorkers = workers
		return workers
	})()
	return hdrReady
}

async function decodeHdrViaWorker(buffer: ArrayBuffer, type: 'hdr' | 'exr', name?: string): Promise<any> {
	const workers = await getHdrWorkers()
	// Playfield bakes take the least-busy worker (decoded bytes are
	// identical); round-robin resumes where it left off.
	const preferLeastBusy = isPlayfieldCap(name)
	const picked = hdrTracker.pick(workers, preferLeastBusy, hdrNextWorker)
	hdrNextWorker = picked.next
	const worker = picked.worker
	return new Promise((resolve, reject) => {
		const id = hdrNextId++
		hdrPending.set(id, { resolve, reject })
		withWorkerTimeout(hdrPending, id, 60000, 'hdr worker timeout', () => hdrTracker.idle(worker))
		try {
			hdrTracker.busy(worker)
			worker.postMessage({ id, buffer, type, name }, [buffer] as any)
		} catch (e) {
			const entry = settleWorkerEntry(hdrPending, id)
			if (entry) hdrTracker.idle(worker)
			reject(e)
		}
	})
}

export class ThreeTextureLoaderNode implements ITextureLoader<ThreeTexture> {
	/**
	 * Fire-and-forget HDR worker spawn so thread startup overlaps PNG
	 * parsing instead of serializing behind the first float texture.
	 * No-op when the pool is already up; rejections stay observed here.
	 */
	public warmup(): void {
		getHdrWorkers().catch(() => {})
	}

	async loadTexture(name: string, ext: string, data: Uint8Array): Promise<ThreeTexture> {
		const lowerExt = ext.toLowerCase()
		if (lowerExt === '.hdr' || lowerExt === '.exr') {
			// Mirror the browser pre-decode bound: fail fast on huge non-playfield
			// payloads so the map generator skips them on its debug path, while
			// playfield lightmaps still route to the slow decode below.
			if (data.byteLength > MAX_FLOAT_TEXTURE_BYTES && !isPlayfieldCap(name)) {
				throw new Error(
					`Float texture "${name}" is too large to decode ` +
						`(${(data.byteLength / 1048576).toFixed(1)}MB > ${MAX_FLOAT_TEXTURE_BYTES / 1048576}MB cap): ` +
						`skipped before worker decode`,
				)
			}
			try {
				return await this.loadHdrViaWorker(name, lowerExt as '.hdr' | '.exr', data)
			} catch {
				return this.loadHdrFallback(name, lowerExt as '.hdr' | '.exr', data)
			}
		}
		const decoded = await decodePng(data, name)
		if (decoded) {
			const capped = downscaleArray(decoded.data, decoded.width, decoded.height, getMaxTextureSize(name), name)
			return tex(capped.data, capped.width, capped.height, name)
		}
		// LIMITATION (documented, not silent): Node has no JPEG/WebP/GIF/BMP
		// decoder and this package ships none, so any non-PNG payload (VPX
		// stores JPEGs under the nested "JPEG" tag) resolves to a white 1x1
		// placeholder instead of throwing. The browser loader
		// (three-texture-loader-browser.ts) decodes those via
		// createImageBitmap/ImageDecoder, so exports differ by platform for
		// non-PNG textures — see Texture.loadTexture.
		logger().warn(
			'[Texture] unsupported image format – returning 1x1 placeholder for %s (%s, %s bytes)',
			name,
			ext,
			data.byteLength,
		)
		return tex(new Uint8Array([255, 255, 255, 255]), 1, 1, name)
	}

	async loadRawTexture(name: string, data: Uint8Array, w: number, h: number): Promise<ThreeTexture> {
		return tex(data, w, h, name)
	}

	async loadDefaultTexture(name: string, _: string, file: string): Promise<ThreeTexture> {
		const buf = await readFile(join(__dirname, '../../../res/maps', file))
		return this.loadTexture(name, 'png', buf as Uint8Array)
	}

	private defaultNames?: Set<string>

	public hasDefaultTexture(name: string): boolean {
		if (!this.defaultNames) {
			this.defaultNames = new Set<string>()
			try {
				for (const file of readdirSync(join(__dirname, '../../../res/maps'))) {
					const lower = file.toLowerCase()
					this.defaultNames.add(lower)
					this.defaultNames.add(lower.replace(/\.[^.]*$/, ''))
				}
			} catch {
				// No res/maps available; every name then counts as unknown.
			}
		}
		return this.defaultNames.has(name.toLowerCase())
	}

	private async loadHdrViaWorker(name: string, ext: '.hdr' | '.exr', data: Uint8Array): Promise<ThreeTexture> {
		const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
		const res: any = await decodeHdrViaWorker(buffer, ext.slice(1) as 'hdr' | 'exr', name)
		const texData = res.data as any
		const width = res.width as number
		const height = res.height as number
		const type = res.type as any
		const format = res.format as any
		const t: any = new DataTexture(texData, width, height, format, type)
		t.colorSpace = res.colorSpace ?? LinearSRGBColorSpace
		t.flipY = false
		t.needsUpdate = true
		t.name = `texture:${name}`
		return t as ThreeTexture
	}

	private loadHdrFallback(name: string, ext: '.hdr' | '.exr', data: Uint8Array): ThreeTexture {
		try {
			const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
			const Loader = ext === '.exr' ? EXRLoader : HDRLoader
			const texData: any = new (Loader as any)().parse(buffer)
			let out = texData.data
			let width: number = texData.width
			let height: number = texData.height
			const max = getMaxTextureSize(name)
			if (width > max || height > max) {
				const scaled = downscaleArray(out, width, height, max, name, texData.type)
				out = scaled.data
				width = scaled.width
				height = scaled.height
			}
			const t: any = new DataTexture(out, width, height, texData.format, texData.type)
			t.colorSpace = texData.colorSpace ?? LinearSRGBColorSpace
			t.flipY = false
			t.needsUpdate = true
			t.name = `texture:${name}`
			return t as ThreeTexture
		} catch (e: any) {
			throw new Error(`HDR/EXR parse failed for "${name}" (${ext}): ${e.message}`)
		}
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

type DecodedImage = { data: Uint8Array; width: number; height: number }

const PNG_MAGIC = [137, 80, 78, 71, 13, 10, 26, 10]

async function decodePng(data: Uint8Array, name: string): Promise<DecodedImage | null> {
	if (data.length < 8 || !PNG_MAGIC.every((magic, index) => data[index] === magic)) {
		return null
	}
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
	let width = 0
	let height = 0
	let colorType = 0
	let bitDepth = 8
	let palette: Uint8Array | null = null
	let transparency: Uint8Array | null = null
	const idatParts: Uint8Array[] = []
	let offset = 8
	while (offset + 8 <= data.length) {
		const length = view.getUint32(offset)
		const type = String.fromCharCode(data[offset + 4], data[offset + 5], data[offset + 6], data[offset + 7])
		const payload = data.subarray(offset + 8, offset + 8 + length)
		if (payload.length < length) {
			return null
		}
		if (type === 'IHDR') {
			width = view.getUint32(offset + 8)
			height = view.getUint32(offset + 12)
			colorType = data[offset + 17]
			bitDepth = data[offset + 16]
			if (data[offset + 20] !== 0 || width === 0 || height === 0) {
				return null
			}
			// 8-bit is the VPX norm; 16-bit samples decode to their high
			// byte (matching createImageBitmap's downscale). Sub-byte depths
			// (1/2/4-bit gray and palette) need bit unpacking and stay
			// unsupported, as does 16-bit palette (invalid per PNG spec).
			if (bitDepth === 16) {
				if (colorType !== 0 && colorType !== 2 && colorType !== 4 && colorType !== 6) {
					return null
				}
			} else if (bitDepth !== 8) {
				return null
			}
		} else if (type === 'PLTE') {
			palette = payload.slice()
		} else if (type === 'tRNS') {
			transparency = payload.slice()
		} else if (type === 'IDAT') {
			idatParts.push(payload)
		} else if (type === 'IEND') {
			break
		}
		offset += 12 + length
	}
	if (!width || !height || !idatParts.length || (colorType === 3 && !palette)) {
		return null
	}
	if (colorType !== 0 && colorType !== 2 && colorType !== 3 && colorType !== 4 && colorType !== 6) {
		return null
	}
	const channels = colorType === 0 || colorType === 3 ? 1 : colorType === 4 ? 2 : colorType === 2 ? 3 : 4
	// 16-bit samples are big-endian pairs; the filter distance and stride
	// count both bytes while expansion below reads the high byte of each.
	const bytesPerPixel = channels * (bitDepth === 16 ? 2 : 1)
	const raw = await inflateZlib(idatParts)
	const stride = width * bytesPerPixel
	if (!raw || raw.length !== height * (stride + 1)) {
		return null
	}
	unfilterScanlines(raw, width, height, bytesPerPixel)
	// Oversize playfield bakes skip the full-res RGBA buffer: box windows
	// accumulate straight from unfiltered samples, so the later downscale
	// below is a no-op on already-capped dims.
	const max = getMaxTextureSize(name)
	if (isPlayfieldCap(name) && (width > max || height > max)) {
		return expandAndBoxAverage(raw, width, height, bytesPerPixel, colorType, palette, transparency, bitDepth, max)
	}
	return {
		data: expandToRgba(raw, width, height, bytesPerPixel, colorType, palette, transparency, bitDepth),
		width,
		height,
	}
}

// Overload resolution picks the options variant, so pin the single-input signature.
const zlibInflate = promisify(zlibInflateCb) as (input: Uint8Array) => Promise<Uint8Array>

async function inflateZlib(parts: Uint8Array[]): Promise<Uint8Array | null> {
	try {
		// Old path streamed IDAT parts with no copy; this pays one file-sized concat memcpy.
		const compressed = Buffer.concat(parts)
		try {
			// Async node:zlib runs off the event loop on the shared libuv
			// threadpool (sized by UV_THREADPOOL_SIZE), so the map
			// generator's preload cap (ThreeMapGenerator.pickConcurrency)
			// only bounds queue delay. HDR decodes run on Worker threads,
			// never the libuv pool.
			return await zlibInflate(compressed)
		} catch {
			// Corrupt input or threadpool pressure falls through to pako
			// below, which inflates synchronously on this thread: a
			// starved pool stalls the event loop for the whole
			// decompression instead of just queueing behind it.
		}
		const pako = await import('pako')
		const inflate = (pako as unknown as { inflate?: (input: Uint8Array) => Uint8Array }).inflate
		if (inflate) {
			return inflate(compressed)
		}
		const fallback = (pako as unknown as { default?: { inflate?: (input: Uint8Array) => Uint8Array } }).default
			?.inflate
		if (fallback) {
			return fallback(compressed)
		}
	} catch {
		// Concat failure or no decoder available.
	}
	return null
}

export function unfilterScanlines(raw: Uint8Array, width: number, height: number, bytesPerPixel: number): void {
	const stride = width * bytesPerPixel
	if (height === 0 || stride === 0) return
	for (let row = 0; row < height; row++) {
		const rowStart = row * (stride + 1)
		const filter = raw[rowStart]
		// Type 0 stores raw samples; nothing to reconstruct.
		if (filter === 0) continue
		const cur = rowStart + 1
		if (filter === 1) {
			for (let col = 0; col < stride; col++) {
				const left = col >= bytesPerPixel ? raw[cur + col - bytesPerPixel] : 0
				raw[cur + col] = (raw[cur + col] + left) & 0xff
			}
		} else if (filter === 2) {
			// The first row has no predecessor, so Up reconstructs to identity.
			if (row === 0) continue
			const prev = cur - stride - 1
			for (let col = 0; col < stride; col++) {
				raw[cur + col] = (raw[cur + col] + raw[prev + col]) & 0xff
			}
		} else if (filter === 3) {
			const prev = row > 0 ? cur - stride - 1 : -1
			for (let col = 0; col < stride; col++) {
				const left = col >= bytesPerPixel ? raw[cur + col - bytesPerPixel] : 0
				const up = prev >= 0 ? raw[prev + col] : 0
				raw[cur + col] = (raw[cur + col] + ((left + up) >> 1)) & 0xff
			}
		} else if (filter === 4) {
			const hasPrev = row > 0
			const prev = cur - stride - 1
			for (let col = 0; col < stride; col++) {
				const left = col >= bytesPerPixel ? raw[cur + col - bytesPerPixel] : 0
				const up = hasPrev ? raw[prev + col] : 0
				const upLeft = hasPrev && col >= bytesPerPixel ? raw[prev + col - bytesPerPixel] : 0
				raw[cur + col] = (raw[cur + col] + paethPredictor(left, up, upLeft)) & 0xff
			}
		}
		// Unknown filter types fall through untouched, matching the old
		// recon=0 path; inflated length was already validated above.
	}
}

function paethPredictor(left: number, up: number, upLeft: number): number {
	const base = left + up - upLeft
	const distLeft = Math.abs(base - left)
	const distUp = Math.abs(base - up)
	const distUpLeft = Math.abs(base - upLeft)
	if (distLeft <= distUp && distLeft <= distUpLeft) {
		return left
	}
	return distUp <= distUpLeft ? up : upLeft
}

/**
 * One PNG sample → RGBA pixel, used by expandToRgba and the fused generic
 * fallback. The per-colorType fused kernels below inline this same
 * mapping with format dispatch hoisted above their window loops; the
 * fused≡unfused tests pin them byte-identical so the copies cannot drift
 * apart silently.
 */
function readPngPixel(
	raw: Uint8Array,
	src: number,
	colorType: number,
	palette: Uint8Array | null,
	transparency: Uint8Array | null,
	sample: number,
	out: Uint8Array,
	dst: number,
): void {
	if (colorType === 6) {
		out[dst] = raw[src]
		out[dst + 1] = raw[src + sample]
		out[dst + 2] = raw[src + 2 * sample]
		out[dst + 3] = raw[src + 3 * sample]
	} else if (colorType === 2) {
		out[dst] = raw[src]
		out[dst + 1] = raw[src + sample]
		out[dst + 2] = raw[src + 2 * sample]
		out[dst + 3] =
			sample === 1
				? isTransparentRgb(raw[src], raw[src + 1], raw[src + 2], transparency)
					? 0
					: 255
				: isTransparentRgb16(raw, src, transparency)
					? 0
					: 255
	} else if (colorType === 4) {
		out[dst] = raw[src]
		out[dst + 1] = raw[src]
		out[dst + 2] = raw[src]
		out[dst + 3] = raw[src + sample]
	} else if (colorType === 0) {
		out[dst] = raw[src]
		out[dst + 1] = raw[src]
		out[dst + 2] = raw[src]
		out[dst + 3] =
			sample === 1
				? isTransparentGray(raw[src], transparency)
					? 0
					: 255
				: isTransparentGray16(raw, src, transparency)
					? 0
					: 255
	} else if (palette) {
		const entry = raw[src] * 3
		out[dst] = entry + 2 < palette.length ? palette[entry] : 0
		out[dst + 1] = entry + 2 < palette.length ? palette[entry + 1] : 0
		out[dst + 2] = entry + 2 < palette.length ? palette[entry + 2] : 0
		out[dst + 3] = transparency && raw[src] < transparency.length ? transparency[raw[src]] : 255
	}
}

export function expandToRgba(
	raw: Uint8Array,
	width: number,
	height: number,
	bytesPerPixel: number,
	colorType: number,
	palette: Uint8Array | null,
	transparency: Uint8Array | null,
	bitDepth = 8,
): Uint8Array {
	const out = new Uint8Array(width * height * 4)
	const stride = width * bytesPerPixel
	// 16-bit samples are big-endian pairs: channels sit `sample` apart and
	// the high byte (raw[src]) carries the 8-bit value.
	const sample = bitDepth === 16 ? 2 : 1
	for (let row = 0; row < height; row++) {
		const rowStart = row * (stride + 1) + 1
		for (let col = 0; col < width; col++) {
			readPngPixel(
				raw,
				rowStart + col * bytesPerPixel,
				colorType,
				palette,
				transparency,
				sample,
				out,
				(row * width + col) * 4,
			)
		}
	}
	return out
}

/**
 * Fused expand+box-average for oversize playfield PNGs. Accumulates RGBA
 * box windows straight from unfiltered samples, skipping the full-res
 * RGBA buffer (peak drops from ~3x frame to compressed + scanlines +
 * downscaled). Windows come from the shared boxWindowGeometry and pixels
 * from the shared readPngPixel, so output bytes equal the unfused path
 * exactly; Uint8 sums are exact in float64, so accumulation order cannot
 * drift. Half-float rounding order is untouched — this path only ever
 * sees Uint8 samples.
 */
export function expandAndBoxAverage(
	raw: Uint8Array,
	width: number,
	height: number,
	bytesPerPixel: number,
	colorType: number,
	palette: Uint8Array | null,
	transparency: Uint8Array | null,
	bitDepth: number,
	max: number,
): DecodedImage {
	const { nw, nh, x0, x1, y0, y1 } = boxWindowGeometry(width, height, max)
	const out = new Uint8Array(nw * nh * 4)
	const stride = width * bytesPerPixel
	const sample = bitDepth === 16 ? 2 : 1
	// Format dispatch happens once, above the window loops: one kernel per
	// colorType, mirroring the per-dtype box kernels in
	// texture-downscale.ts, so the hot loops hold no per-pixel format
	// branch. Alpha-key presence folds into an impossible key (-1), so
	// opaque and keyed inputs share a kernel; only the pixel-data key
	// match remains per pixel. Accumulation order (sy outer, sx inner,
	// R/G/B/A) matches boxInt's comps===4 fast path, so output bytes equal
	// the unfused path exactly; Uint8 sums are exact in float64, so
	// accumulation order cannot drift. Half-float rounding order is
	// untouched — this path only ever sees Uint8 samples. Anything
	// decodePng rejects (unknown colorType, palette-less index) keeps the
	// legacy shared-pixel loop byte-for-byte.
	switch (colorType) {
		case 6:
			fusedRgba(raw, stride, bytesPerPixel, sample, out, nw, nh, x0, x1, y0, y1)
			break
		case 4:
			fusedGrayAlpha(raw, stride, bytesPerPixel, sample, out, nw, nh, x0, x1, y0, y1)
			break
		case 2:
			if (sample === 1)
				fusedRgb8(raw, stride, bytesPerPixel, keyedRgb8Key(transparency), out, nw, nh, x0, x1, y0, y1)
			else fusedRgb16(raw, stride, bytesPerPixel, keyedRgb16Key(transparency), out, nw, nh, x0, x1, y0, y1)
			break
		case 0:
			if (sample === 1)
				fusedGray8(raw, stride, bytesPerPixel, keyedGray8Key(transparency), out, nw, nh, x0, x1, y0, y1)
			else fusedGray16(raw, stride, bytesPerPixel, keyedGray16Key(transparency), out, nw, nh, x0, x1, y0, y1)
			break
		case 3:
			if (palette) {
				fusedPalette(
					raw,
					stride,
					bytesPerPixel,
					buildPaletteLut(palette, transparency),
					out,
					nw,
					nh,
					x0,
					x1,
					y0,
					y1,
				)
			} else {
				// No palette: keep the legacy shared-pixel loop byte-for-byte.
				fusedGeneric(
					raw,
					stride,
					bytesPerPixel,
					colorType,
					palette,
					transparency,
					sample,
					out,
					nw,
					nh,
					x0,
					x1,
					y0,
					y1,
				)
			}
			break
		default:
			fusedGeneric(
				raw,
				stride,
				bytesPerPixel,
				colorType,
				palette,
				transparency,
				sample,
				out,
				nw,
				nh,
				x0,
				x1,
				y0,
				y1,
			)
			break
	}
	return { data: out, width: nw, height: nh }
}

// Impossible alpha keys (-1): no usable tRNS entry means the key match
// below never fires, so opaque and keyed inputs share one kernel with no
// presence dispatch per pixel. Key packing matches the isTransparent*
// guards exactly (length checks included).
function keyedGray8Key(transparency: Uint8Array | null): number {
	return transparency && transparency.length >= 2 ? transparency[1] : -1
}

function keyedGray16Key(transparency: Uint8Array | null): number {
	return transparency && transparency.length >= 2 ? (transparency[0] << 8) | transparency[1] : -1
}

function keyedRgb8Key(transparency: Uint8Array | null): number {
	return transparency && transparency.length >= 6
		? transparency[1] * 0x10000 + transparency[3] * 0x100 + transparency[5]
		: -1
}

function keyedRgb16Key(transparency: Uint8Array | null): number {
	return transparency && transparency.length >= 6
		? transparency[0] * 2 ** 40 +
				transparency[1] * 2 ** 32 +
				transparency[2] * 2 ** 24 +
				transparency[3] * 2 ** 16 +
				transparency[4] * 2 ** 8 +
				transparency[5]
		: -1
}

/** Indexed color → RGBA lookup built once: bounds and tRNS guards evaluate here, never per pixel. */
function buildPaletteLut(palette: Uint8Array, transparency: Uint8Array | null): Uint8Array {
	const lut = new Uint8Array(256 * 4)
	for (let i = 0; i < 256; i++) {
		const entry = i * 3
		const dst = i * 4
		lut[dst] = entry + 2 < palette.length ? palette[entry] : 0
		lut[dst + 1] = entry + 2 < palette.length ? palette[entry + 1] : 0
		lut[dst + 2] = entry + 2 < palette.length ? palette[entry + 2] : 0
		lut[dst + 3] = transparency && i < transparency.length ? transparency[i] : 255
	}
	return lut
}

function fusedRgba(
	raw: Uint8Array,
	stride: number,
	bytesPerPixel: number,
	sample: number,
	out: Uint8Array,
	nw: number,
	nh: number,
	x0: Int32Array,
	x1: Int32Array,
	y0: Int32Array,
	y1: Int32Array,
): void {
	for (let y = 0; y < nh; y++) {
		const ya = y0[y]
		const yb = y1[y]
		for (let x = 0; x < nw; x++) {
			const xa = x0[x]
			const xb = x1[x]
			const count = (xb - xa) * (yb - ya)
			let sumR = 0
			let sumG = 0
			let sumB = 0
			let sumA = 0
			for (let sy = ya; sy < yb; sy++) {
				const rowStart = sy * (stride + 1) + 1
				for (let sx = xa; sx < xb; sx++) {
					const s = rowStart + sx * bytesPerPixel
					sumR += raw[s]
					sumG += raw[s + sample]
					sumB += raw[s + 2 * sample]
					sumA += raw[s + 3 * sample]
				}
			}
			const dst = (y * nw + x) * 4
			out[dst] = Math.round(sumR / count)
			out[dst + 1] = Math.round(sumG / count)
			out[dst + 2] = Math.round(sumB / count)
			out[dst + 3] = Math.round(sumA / count)
		}
	}
}

function fusedGrayAlpha(
	raw: Uint8Array,
	stride: number,
	bytesPerPixel: number,
	sample: number,
	out: Uint8Array,
	nw: number,
	nh: number,
	x0: Int32Array,
	x1: Int32Array,
	y0: Int32Array,
	y1: Int32Array,
): void {
	for (let y = 0; y < nh; y++) {
		const ya = y0[y]
		const yb = y1[y]
		for (let x = 0; x < nw; x++) {
			const xa = x0[x]
			const xb = x1[x]
			const count = (xb - xa) * (yb - ya)
			let sumR = 0
			let sumG = 0
			let sumB = 0
			let sumA = 0
			for (let sy = ya; sy < yb; sy++) {
				const rowStart = sy * (stride + 1) + 1
				for (let sx = xa; sx < xb; sx++) {
					const s = rowStart + sx * bytesPerPixel
					const g = raw[s]
					sumR += g
					sumG += g
					sumB += g
					sumA += raw[s + sample]
				}
			}
			const dst = (y * nw + x) * 4
			out[dst] = Math.round(sumR / count)
			out[dst + 1] = Math.round(sumG / count)
			out[dst + 2] = Math.round(sumB / count)
			out[dst + 3] = Math.round(sumA / count)
		}
	}
}

function fusedGray8(
	raw: Uint8Array,
	stride: number,
	bytesPerPixel: number,
	key: number,
	out: Uint8Array,
	nw: number,
	nh: number,
	x0: Int32Array,
	x1: Int32Array,
	y0: Int32Array,
	y1: Int32Array,
): void {
	for (let y = 0; y < nh; y++) {
		const ya = y0[y]
		const yb = y1[y]
		for (let x = 0; x < nw; x++) {
			const xa = x0[x]
			const xb = x1[x]
			const count = (xb - xa) * (yb - ya)
			let sumR = 0
			let sumG = 0
			let sumB = 0
			let sumA = 0
			for (let sy = ya; sy < yb; sy++) {
				const rowStart = sy * (stride + 1) + 1
				for (let sx = xa; sx < xb; sx++) {
					const g = raw[rowStart + sx * bytesPerPixel]
					sumR += g
					sumG += g
					sumB += g
					sumA += g === key ? 0 : 255
				}
			}
			const dst = (y * nw + x) * 4
			out[dst] = Math.round(sumR / count)
			out[dst + 1] = Math.round(sumG / count)
			out[dst + 2] = Math.round(sumB / count)
			out[dst + 3] = Math.round(sumA / count)
		}
	}
}

function fusedGray16(
	raw: Uint8Array,
	stride: number,
	bytesPerPixel: number,
	key: number,
	out: Uint8Array,
	nw: number,
	nh: number,
	x0: Int32Array,
	x1: Int32Array,
	y0: Int32Array,
	y1: Int32Array,
): void {
	for (let y = 0; y < nh; y++) {
		const ya = y0[y]
		const yb = y1[y]
		for (let x = 0; x < nw; x++) {
			const xa = x0[x]
			const xb = x1[x]
			const count = (xb - xa) * (yb - ya)
			let sumR = 0
			let sumG = 0
			let sumB = 0
			let sumA = 0
			for (let sy = ya; sy < yb; sy++) {
				const rowStart = sy * (stride + 1) + 1
				for (let sx = xa; sx < xb; sx++) {
					const s = rowStart + sx * bytesPerPixel
					const g = raw[s]
					sumR += g
					sumG += g
					sumB += g
					sumA += ((raw[s] << 8) | raw[s + 1]) === key ? 0 : 255
				}
			}
			const dst = (y * nw + x) * 4
			out[dst] = Math.round(sumR / count)
			out[dst + 1] = Math.round(sumG / count)
			out[dst + 2] = Math.round(sumB / count)
			out[dst + 3] = Math.round(sumA / count)
		}
	}
}

function fusedRgb8(
	raw: Uint8Array,
	stride: number,
	bytesPerPixel: number,
	key: number,
	out: Uint8Array,
	nw: number,
	nh: number,
	x0: Int32Array,
	x1: Int32Array,
	y0: Int32Array,
	y1: Int32Array,
): void {
	for (let y = 0; y < nh; y++) {
		const ya = y0[y]
		const yb = y1[y]
		for (let x = 0; x < nw; x++) {
			const xa = x0[x]
			const xb = x1[x]
			const count = (xb - xa) * (yb - ya)
			let sumR = 0
			let sumG = 0
			let sumB = 0
			let sumA = 0
			for (let sy = ya; sy < yb; sy++) {
				const rowStart = sy * (stride + 1) + 1
				for (let sx = xa; sx < xb; sx++) {
					const s = rowStart + sx * bytesPerPixel
					const r = raw[s]
					const g = raw[s + 1]
					const b = raw[s + 2]
					sumR += r
					sumG += g
					sumB += b
					sumA += r * 0x10000 + g * 0x100 + b === key ? 0 : 255
				}
			}
			const dst = (y * nw + x) * 4
			out[dst] = Math.round(sumR / count)
			out[dst + 1] = Math.round(sumG / count)
			out[dst + 2] = Math.round(sumB / count)
			out[dst + 3] = Math.round(sumA / count)
		}
	}
}

function fusedRgb16(
	raw: Uint8Array,
	stride: number,
	bytesPerPixel: number,
	key: number,
	out: Uint8Array,
	nw: number,
	nh: number,
	x0: Int32Array,
	x1: Int32Array,
	y0: Int32Array,
	y1: Int32Array,
): void {
	for (let y = 0; y < nh; y++) {
		const ya = y0[y]
		const yb = y1[y]
		for (let x = 0; x < nw; x++) {
			const xa = x0[x]
			const xb = x1[x]
			const count = (xb - xa) * (yb - ya)
			let sumR = 0
			let sumG = 0
			let sumB = 0
			let sumA = 0
			for (let sy = ya; sy < yb; sy++) {
				const rowStart = sy * (stride + 1) + 1
				for (let sx = xa; sx < xb; sx++) {
					const s = rowStart + sx * bytesPerPixel
					const r = raw[s]
					const g = raw[s + 2]
					const b = raw[s + 4]
					sumR += r
					sumG += g
					sumB += b
					sumA +=
						raw[s] * 2 ** 40 +
							raw[s + 1] * 2 ** 32 +
							raw[s + 2] * 2 ** 24 +
							raw[s + 3] * 2 ** 16 +
							raw[s + 4] * 2 ** 8 +
							raw[s + 5] ===
						key
							? 0
							: 255
				}
			}
			const dst = (y * nw + x) * 4
			out[dst] = Math.round(sumR / count)
			out[dst + 1] = Math.round(sumG / count)
			out[dst + 2] = Math.round(sumB / count)
			out[dst + 3] = Math.round(sumA / count)
		}
	}
}

function fusedPalette(
	raw: Uint8Array,
	stride: number,
	bytesPerPixel: number,
	lut: Uint8Array,
	out: Uint8Array,
	nw: number,
	nh: number,
	x0: Int32Array,
	x1: Int32Array,
	y0: Int32Array,
	y1: Int32Array,
): void {
	for (let y = 0; y < nh; y++) {
		const ya = y0[y]
		const yb = y1[y]
		for (let x = 0; x < nw; x++) {
			const xa = x0[x]
			const xb = x1[x]
			const count = (xb - xa) * (yb - ya)
			let sumR = 0
			let sumG = 0
			let sumB = 0
			let sumA = 0
			for (let sy = ya; sy < yb; sy++) {
				const rowStart = sy * (stride + 1) + 1
				for (let sx = xa; sx < xb; sx++) {
					const l = raw[rowStart + sx * bytesPerPixel] * 4
					sumR += lut[l]
					sumG += lut[l + 1]
					sumB += lut[l + 2]
					sumA += lut[l + 3]
				}
			}
			const dst = (y * nw + x) * 4
			out[dst] = Math.round(sumR / count)
			out[dst + 1] = Math.round(sumG / count)
			out[dst + 2] = Math.round(sumB / count)
			out[dst + 3] = Math.round(sumA / count)
		}
	}
}

/** Legacy shared-pixel loop for inputs decodePng rejects; kept byte-for-byte. */
function fusedGeneric(
	raw: Uint8Array,
	stride: number,
	bytesPerPixel: number,
	colorType: number,
	palette: Uint8Array | null,
	transparency: Uint8Array | null,
	sample: number,
	out: Uint8Array,
	nw: number,
	nh: number,
	x0: Int32Array,
	x1: Int32Array,
	y0: Int32Array,
	y1: Int32Array,
): void {
	const px = new Uint8Array(4)
	for (let y = 0; y < nh; y++) {
		const ya = y0[y]
		const yb = y1[y]
		for (let x = 0; x < nw; x++) {
			const xa = x0[x]
			const xb = x1[x]
			const count = (xb - xa) * (yb - ya)
			let sumR = 0
			let sumG = 0
			let sumB = 0
			let sumA = 0
			for (let sy = ya; sy < yb; sy++) {
				const rowStart = sy * (stride + 1) + 1
				for (let sx = xa; sx < xb; sx++) {
					readPngPixel(raw, rowStart + sx * bytesPerPixel, colorType, palette, transparency, sample, px, 0)
					sumR += px[0]
					sumG += px[1]
					sumB += px[2]
					sumA += px[3]
				}
			}
			const dst = (y * nw + x) * 4
			out[dst] = Math.round(sumR / count)
			out[dst + 1] = Math.round(sumG / count)
			out[dst + 2] = Math.round(sumB / count)
			out[dst + 3] = Math.round(sumA / count)
		}
	}
}

function isTransparentRgb(red: number, green: number, blue: number, transparency: Uint8Array | null): boolean {
	return (
		!!transparency &&
		transparency.length >= 6 &&
		transparency[1] === red &&
		transparency[3] === green &&
		transparency[5] === blue
	)
}

function isTransparentGray(gray: number, transparency: Uint8Array | null): boolean {
	return !!transparency && transparency.length >= 2 && transparency[1] === gray
}

// 16-bit tRNS entries are full big-endian sample values (unlike the 8-bit
// path above, which reads the low byte encoders fill in).
function isTransparentRgb16(raw: Uint8Array, src: number, transparency: Uint8Array | null): boolean {
	return (
		!!transparency &&
		transparency.length >= 6 &&
		transparency[0] === raw[src] &&
		transparency[1] === raw[src + 1] &&
		transparency[2] === raw[src + 2] &&
		transparency[3] === raw[src + 3] &&
		transparency[4] === raw[src + 4] &&
		transparency[5] === raw[src + 5]
	)
}

function isTransparentGray16(raw: Uint8Array, src: number, transparency: Uint8Array | null): boolean {
	return (
		!!transparency && transparency.length >= 2 && transparency[0] === raw[src] && transparency[1] === raw[src + 1]
	)
}
