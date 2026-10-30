import { parentPort } from 'node:worker_threads'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import { downscaleArray } from './texture-downscale.js'
import { getMaxTextureSize } from './texture-tags.js'

if (parentPort) {
	parentPort.on('message', (msg: any) => {
		const { id, buffer, type, name } = msg as {
			id: number
			buffer: ArrayBuffer
			type: 'hdr' | 'exr'
			name?: string
		}
		try {
			const loader = type === 'hdr' ? new HDRLoader() : new EXRLoader()
			let texData: any = (loader as any).parse(buffer)
			let data: any = texData.data
			let width: number = texData.width
			let height: number = texData.height
			const max = getMaxTextureSize(name ?? '')
			if (width > max || height > max) {
				const scaled = downscaleArray(data, width, height, max, name ?? '', texData.type)
				data = scaled.data
				width = scaled.width
				height = scaled.height
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
