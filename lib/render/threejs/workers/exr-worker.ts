// Worker for HDR/EXR decoding — offloads DataTextureLoader.parse off main thread.
import { DataUtils, HalfFloatType } from 'three'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import { MAX_FLOAT_TEXTURE_BYTES } from '../../../util/quality.js'

// Local copy of material-shared.ts RE_PLAYFIELD (same playfield set selects the
// box-average path here; workers cannot share module imports, so keep in sync).
const RE_PLAYFIELD = /playfield|nestmap|bake|vlm/i

self.onmessage = (e: MessageEvent) => {
	const { id, buffer, type, max, name } = e.data as {
		id: number
		buffer: ArrayBuffer
		type: 'exr' | 'hdr'
		max?: number
		name?: string
	}
	try {
		// Last line of defense for the pre-decode bound enforced in
		// three-texture-loader-browser.ts: the parse below expands to a
		// full-res half-float frame before downsampling, so reject here too.
		if (buffer.byteLength > MAX_FLOAT_TEXTURE_BYTES) {
			throw new Error(
				`Float texture "${name ?? 'unknown'}" is too large to decode ` +
					`(${(buffer.byteLength / 1048576).toFixed(1)}MB > ${MAX_FLOAT_TEXTURE_BYTES / 1048576}MB cap)`,
			)
		}
		const loader = type === 'hdr' ? new HDRLoader() : new EXRLoader()
		let texData = (loader as any).parse(buffer) as any
		let width: number = texData.width
		let height: number = texData.height
		let data: any = texData.data
		const texType: number = texData.type
		const format: number = texData.format
		const colorSpace: string | undefined = texData.colorSpace
		const limit = typeof max === 'number' && max > 0 ? max : 0
		if (limit && (width > limit || height > limit)) {
			const scale = Math.min(limit / width, limit / height)
			const nw = Math.max(1, Math.floor(width * scale))
			const nh = Math.max(1, Math.floor(height * scale))
			const comps = Math.round(data.length / (width * height)) || 3
			const out: any = new (data.constructor as any)(nw * nh * comps)
			// Same quality split as downscaleHdrData: playfields get a
			// half-float-aware box average (nearest would sparkle on HDR
			// playfields); small non-playfields keep point sampling.
			const isPlayfield = RE_PLAYFIELD.test(name ?? '')
			const isHalf = data instanceof Uint16Array && texType === HalfFloatType
			const isFloat = data instanceof Float32Array
			if (isPlayfield) {
				for (let y = 0; y < nh; y++) {
					const y0 = Math.floor((y / nh) * height)
					const y1 = Math.min(height, Math.ceil(((y + 1) / nh) * height))
					for (let x = 0; x < nw; x++) {
						const x0 = Math.floor((x / nw) * width)
						const x1 = Math.min(width, Math.ceil(((x + 1) / nw) * width))
						const count = (x1 - x0) * (y1 - y0)
						const dBase = (y * nw + x) * comps
						for (let c = 0; c < comps; c++) {
							let sum = 0
							for (let sy = y0; sy < y1; sy++) {
								const row = sy * width * comps
								for (let sx = x0; sx < x1; sx++)
									sum += isHalf
										? DataUtils.fromHalfFloat((data as any)[row + sx * comps + c] as any)
										: (data as any)[row + sx * comps + c]
							}
							const avg = sum / count
							out[dBase + c] = isHalf ? DataUtils.toHalfFloat(avg) : isFloat ? avg : Math.round(avg)
						}
					}
				}
			} else {
				for (let y = 0; y < nh; y++) {
					const sy = Math.min(height - 1, Math.floor((y / nh) * height))
					for (let x = 0; x < nw; x++) {
						const sx = Math.min(width - 1, Math.floor((x / nw) * width))
						const sIdx = (sy * width + sx) * comps
						const dIdx = (y * nw + x) * comps
						for (let c = 0; c < comps; c++) out[dIdx + c] = data[sIdx + c]
					}
				}
			}
			data = out
			width = nw
			height = nh
			texData = { ...texData, width, height, data }
		}
		self.postMessage(
			{ id, ok: true, width, height, data, type: texType, format, colorSpace },
			data?.buffer ? ([data.buffer] as any) : undefined,
		)
	} catch (err: any) {
		self.postMessage({ id, ok: false, error: err?.message || String(err) })
	}
}
