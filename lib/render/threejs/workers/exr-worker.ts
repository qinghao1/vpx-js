// Worker for HDR/EXR decoding — offloads DataTextureLoader.parse off main thread.
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import { MAX_FLOAT_TEXTURE_BYTES } from '../../../util/quality.js'
import { downscaleArray } from '../texture-downscale.js'
import { isPlayfieldCap } from '../texture-tags.js'

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
		// Playfield bakes are exempt (the main thread routes over-cap ones
		// here precisely to keep the slow parse off its event loop); a
		// worker-side OOM kills only the worker, not the tab.
		if (buffer.byteLength > MAX_FLOAT_TEXTURE_BYTES && !isPlayfieldCap(name)) {
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
			const scaled = downscaleArray(data, width, height, limit, name, texType)
			data = scaled.data
			width = scaled.width
			height = scaled.height
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
