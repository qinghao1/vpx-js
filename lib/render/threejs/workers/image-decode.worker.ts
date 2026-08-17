// Worker for regular image decode — offloads createImageBitmap + resize off main thread.
self.onmessage = async (e: MessageEvent) => {
	const { id, buffer, mime, max } = e.data as {
		id: number
		buffer: ArrayBuffer
		mime: string
		max: number
		name: string
	}
	try {
		let bitmap: ImageBitmap | null = null
		if (typeof (self as any).ImageDecoder !== 'undefined') {
			try {
				const Decoder = (self as any).ImageDecoder
				const decoder = new Decoder({ data: buffer, type: mime })
				const { image } = (await decoder.decode()) as any
				bitmap = await createImageBitmap(image as any, { imageOrientation: 'flipY' } as any).catch(() =>
					createImageBitmap(image as any),
				)
				try {
					image.close?.()
				} catch {}
				try {
					decoder.close?.()
				} catch {}
			} catch {
				bitmap = null
			}
		}
		if (!bitmap) {
			const blob = new Blob([buffer], { type: mime as any })
			try {
				bitmap = await createImageBitmap(blob as any, { imageOrientation: 'flipY' } as any)
			} catch {
				bitmap = await createImageBitmap(blob as any)
			}
		}
		if (!bitmap) throw new Error('decode failed')
		if (typeof max === 'number' && max > 0 && (bitmap.width > max || bitmap.height > max)) {
			const scale = Math.min(max / bitmap.width, max / bitmap.height)
			const nw = Math.max(1, Math.floor(bitmap.width * scale))
			const nh = Math.max(1, Math.floor(bitmap.height * scale))
			let resized: ImageBitmap | null = null
			try {
				resized = await (createImageBitmap as any)(bitmap, {
					resizeWidth: nw,
					resizeHeight: nh,
					resizeQuality: 'high',
				})
			} catch {}
			if (resized) {
				try {
					bitmap.close?.()
				} catch {}
				bitmap = resized
			} else if (typeof (self as any).OffscreenCanvas !== 'undefined') {
				const Canvas: any = (self as any).OffscreenCanvas
				const canvas: any = new Canvas(nw, nh)
				const ctx: any = canvas.getContext('2d')
				if (!ctx) throw new Error('no 2d context')
				ctx.imageSmoothingEnabled = true
				ctx.imageSmoothingQuality = 'high'
				ctx.drawImage(bitmap as any, 0, 0, nw, nh)
				const transferred: any = canvas.transferToImageBitmap?.() ?? (await createImageBitmap(canvas as any))
				try {
					bitmap.close?.()
				} catch {}
				bitmap = transferred
			} else {
				try {
					bitmap.close?.()
				} catch {}
				throw new Error('resize failed')
			}
		}
		;(self as any).postMessage({ id, ok: true, bitmap }, [bitmap as any])
	} catch (err: any) {
		;(self as any).postMessage({ id, ok: false, error: err?.message ?? String(err) })
	}
}
