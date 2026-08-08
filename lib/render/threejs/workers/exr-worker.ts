// Worker for HDR/EXR decoding — offloads DataTextureLoader.parse off main thread.
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'

self.onmessage = (e: MessageEvent) => {
	const { id, buffer, type } = e.data as { id: number; buffer: ArrayBuffer; type: 'exr' | 'hdr' }
	try {
		const loader = type === 'hdr' ? new HDRLoader() : new EXRLoader()
		const texData = (loader as any).parse(buffer) as any
		const width: number = texData.width
		const height: number = texData.height
		const data: any = texData.data
		const texType: number = texData.type
		const format: number = texData.format
		const colorSpace: string | undefined = texData.colorSpace
		self.postMessage(
			{ id, ok: true, width, height, data, type: texType, format, colorSpace },
			data?.buffer ? ([data.buffer] as any) : undefined,
		)
	} catch (err: any) {
		self.postMessage({ id, ok: false, error: err?.message || String(err) })
	}
}
