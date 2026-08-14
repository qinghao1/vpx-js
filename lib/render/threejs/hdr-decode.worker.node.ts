import { parentPort } from 'node:worker_threads'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import { DataUtils, HalfFloatType } from 'three'

if (parentPort) {
	parentPort.on('message', (msg: any) => {
		const { id, buffer, type, name } = msg as { id: number; buffer: ArrayBuffer; type: 'hdr' | 'exr'; name?: string }
		try {
			const loader = type === 'hdr' ? new HDRLoader() : new EXRLoader()
			let texData: any = (loader as any).parse(buffer)
			let data: any = texData.data
			let width: number = texData.width
			let height: number = texData.height
			const max = getMaxTextureSize(name ?? '')
			if (width > max || height > max) {
				const scale = Math.min(max / width, max / height)
				const nw = Math.max(1, Math.floor(width * scale))
				const nh = Math.max(1, Math.floor(height * scale))
				const comps = Math.round(data.length / (width * height)) || 3
				const out = new (data.constructor as any)(nw * nh * comps)
				const isPlayfield = /playfield|nestmap|bake/i.test(name ?? '')
				const isHalf = data instanceof Uint16Array && texData.type === HalfFloatType
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
									for (let sx = x0; sx < x1; sx++) sum += isHalf ? DataUtils.fromHalfFloat((data as any)[row + sx * comps + c] as any) : (data as any)[row + sx * comps + c]
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
			parentPort!.postMessage(
				{
					id,
					ok: true,
					width,
					height,
					data,
					type: texData.type,
					format: texData.format,
					colorSpace: texData.colorSpace,
				},
				data?.buffer ? [data.buffer] : undefined,
			)
		} catch (err: any) {
			parentPort!.postMessage({ id, ok: false, error: err?.message ?? String(err) })
		}
	})
}

export function getMaxTextureSize(name: string): number {
	const isPlayfield = /playfield|nestmap|bake/i.test(name)
	return isPlayfield ? 4096 : 2048
}

export function downscaleHdrData(
	data: Uint16Array | Float32Array | Uint8Array,
	width: number,
	height: number,
	max: number,
	name: string,
	type: number,
): { data: Uint16Array | Float32Array | Uint8Array; width: number; height: number } {
	if (width <= max && height <= max) return { data, width, height }
	const scale = Math.min(max / width, max / height)
	const nw = Math.max(1, Math.floor(width * scale))
	const nh = Math.max(1, Math.floor(height * scale))
	const comps = Math.round(data.length / (width * height)) || 3
	const out = new (data.constructor as any)(nw * nh * comps)
	const isPlayfield = /playfield|nestmap|bake/i.test(name ?? '')
	const isHalf = data instanceof Uint16Array && type === HalfFloatType
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
						for (let sx = x0; sx < x1; sx++) sum += isHalf ? DataUtils.fromHalfFloat((data as any)[row + sx * comps + c] as any) : (data as any)[row + sx * comps + c]
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
	return { data: out, width: nw, height: nh }
}
