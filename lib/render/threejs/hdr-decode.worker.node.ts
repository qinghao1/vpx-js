import { parentPort } from 'node:worker_threads'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'

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
				for (let y = 0; y < nh; y++) {
					const sy = Math.min(height - 1, Math.floor((y / nh) * height))
					for (let x = 0; x < nw; x++) {
						const sx = Math.min(width - 1, Math.floor((x / nw) * width))
						const sIdx = (sy * width + sx) * comps
						const dIdx = (y * nw + x) * comps
						for (let c = 0; c < comps; c++) out[dIdx + c] = data[sIdx + c]
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

function getMaxTextureSize(name: string): number {
	const isPlayfield = /playfield|nestmap|bake/i.test(name)
	return isPlayfield ? 4096 : 2048
}
