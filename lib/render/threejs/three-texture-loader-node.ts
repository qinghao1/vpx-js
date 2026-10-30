// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { availableParallelism } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DataTexture, LinearSRGBColorSpace, RGBAFormat, SRGBColorSpace, type Texture as ThreeTexture } from 'three'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import { logger } from '../../util/logger.js'
import { MAX_FLOAT_TEXTURE_BYTES } from '../../util/quality.js'
import { settleWorkerEntry, type WorkerPendingEntry, withWorkerTimeout } from '../../util/worker-pending.js'
import type { ITextureLoader } from '../irender-api.js'
import { WorkerLoadTracker } from './texture-dispatch.js'
import { downscaleArray } from './texture-downscale.js'
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
		const decoded = await decodePng(data)
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

async function decodePng(data: Uint8Array): Promise<DecodedImage | null> {
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
	const compressedLength = idatParts.reduce((sum, part) => sum + part.length, 0)
	const compressed = new Uint8Array(compressedLength)
	let writeOffset = 0
	for (const part of idatParts) {
		compressed.set(part, writeOffset)
		writeOffset += part.length
	}
	const raw = await inflateZlib(compressed)
	const stride = width * bytesPerPixel
	if (!raw || raw.length !== height * (stride + 1)) {
		return null
	}
	unfilterScanlines(raw, width, height, bytesPerPixel)
	return {
		data: expandToRgba(raw, width, height, bytesPerPixel, colorType, palette, transparency, bitDepth),
		width,
		height,
	}
}

async function inflateZlib(compressed: Uint8Array): Promise<Uint8Array | null> {
	try {
		if (typeof DecompressionStream !== 'undefined') {
			const stream = new DecompressionStream('deflate')
			const writer = stream.writable.getWriter()
			writer.write(compressed as unknown as BufferSource)
			writer.close()
			const chunks: Uint8Array[] = []
			const reader = stream.readable.getReader()
			while (true) {
				const { done, value } = await reader.read()
				if (done) {
					break
				}
				if (value) {
					chunks.push(value)
				}
			}
			const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
			const out = new Uint8Array(total)
			let chunkOffset = 0
			for (const chunk of chunks) {
				out.set(chunk, chunkOffset)
				chunkOffset += chunk.length
			}
			return out
		}
	} catch {
		// fall through to pako
	}
	try {
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
		// no decoder available
	}
	return null
}

function unfilterScanlines(raw: Uint8Array, width: number, height: number, bytesPerPixel: number): void {
	const stride = width * bytesPerPixel
	for (let row = 0; row < height; row++) {
		const rowStart = row * (stride + 1)
		const filter = raw[rowStart]
		const hasPrev = row > 0
		for (let col = 0; col < stride; col++) {
			const index = rowStart + 1 + col
			const left = col >= bytesPerPixel ? raw[index - bytesPerPixel] : 0
			const up = hasPrev ? raw[index - stride - 1] : 0
			const upLeft = hasPrev && col >= bytesPerPixel ? raw[index - stride - 1 - bytesPerPixel] : 0
			let recon = 0
			if (filter === 1) {
				recon = left
			} else if (filter === 2) {
				recon = up
			} else if (filter === 3) {
				recon = (left + up) >> 1
			} else if (filter === 4) {
				recon = paethPredictor(left, up, upLeft)
			}
			raw[index] = (raw[index] + recon) & 0xff
		}
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

function expandToRgba(
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
			const src = rowStart + col * bytesPerPixel
			const dst = (row * width + col) * 4
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
	}
	return out
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
