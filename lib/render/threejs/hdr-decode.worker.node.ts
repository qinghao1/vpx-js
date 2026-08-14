import { parentPort } from 'node:worker_threads'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'

if (parentPort) {
	parentPort.on('message', (msg: any) => {
		const { id, buffer, type } = msg as { id: number; buffer: ArrayBuffer; type: 'hdr' | 'exr' }
		try {
			const loader = type === 'hdr' ? new HDRLoader() : new EXRLoader()
			const texData: any = (loader as any).parse(buffer)
			const data: any = texData.data
			parentPort!.postMessage(
				{
					id,
					ok: true,
					width: texData.width,
					height: texData.height,
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
