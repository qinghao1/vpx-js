import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'

self.onmessage = async e => {
	const { id, buffer, type } = e.data
	try {
		const loader = type === 'hdr' ? new HDRLoader() : new EXRLoader()
		// EXRLoader/HDR createDataTexture expects ArrayBuffer, returns DataTexture
		// We need to parse manually without creating texture that requires DOM
		// Use loader.parse if available, else createDataTexture
		let tex
		if (loader.parse) {
			// Some loaders have parse method
			const data = loader.parse(buffer)
			// data may be DataTexture-like, extract
			if (data && data.image) {
				const { width, height, data: arr } = data.image
				// transfer arr
				self.postMessage(
					{ id, ok: true, width, height, data: arr.buffer, isFloat: arr instanceof Float32Array },
					[arr.buffer],
				)
				return
			}
		}
		// fallback: createDataTexture
		const tex2 = loader.createDataTexture(buffer)
		const img = tex2.image
		const width = img.width
		const height = img.height
		const arr = img.data
		self.postMessage({ id, ok: true, width, height, data: arr.buffer, isFloat: arr instanceof Float32Array }, [
			arr.buffer,
		])
	} catch (err) {
		self.postMessage({ id, ok: false, error: err.message || String(err) })
	}
}
