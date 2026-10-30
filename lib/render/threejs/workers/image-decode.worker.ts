// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

// Worker for regular image decode — offloads createImageBitmap + resize off
// the main thread. Decodes at the capped size up front (single-step resize
// or ImageDecoder desired size) so a giant playfield never materializes a
// full-res frame. The header probe + target math live in the shared
// ../encoded-size-probe.ts module, imported like exr-worker.js does.
import { cappedTarget, probeEncodedSize } from '../encoded-size-probe.js'

self.onmessage = async (e: MessageEvent) => {
	const { id, buffer, mime, max } = e.data as {
		id: number
		buffer: ArrayBuffer
		mime: string
		max: number
		name: string
	}
	try {
		const bitmap = await decodeAtSize(buffer, mime, max)
		;(self as any).postMessage({ id, ok: true, bitmap }, [bitmap as any])
	} catch (err: any) {
		;(self as any).postMessage({ id, ok: false, error: err?.message ?? String(err) })
	}
}

/**
 * Decode flags, matched to three's texture-upload path (non-premultiplied,
 * no browser color conversion — the opaque playfield is unaffected, but the
 * CIB defaults drift cross-browser and Firefox shifts tagged wide-gamut
 * sources). resizeQuality stays explicit everywhere: the default is 'low',
 * and 'high' is near-parity with the old full-decode-then-resize path on
 * Chromium/Firefox, bilinear-grade on Safari.
 * Display-P3 sources tagged sRGB render slightly muted, but 'none' keeps uploads deterministic.
 */
function decodeOptions(extra?: Record<string, unknown>): any {
	return {
		imageOrientation: 'flipY',
		premultiplyAlpha: 'none',
		colorSpaceConversion: 'none',
		...extra,
	} as any
}

async function decodeAtSize(buffer: ArrayBuffer, mime: string, max: number): Promise<ImageBitmap> {
	const target = cappedTarget(probeEncodedSize(new Uint8Array(buffer)), max)
	if (target) {
		// Single-step decode+downscale straight from the encoded bytes: no
		// full-res intermediate for a 6080x8192 playfield.
		try {
			const blob = new Blob([buffer], { type: mime } as any)
			const bitmap = await createImageBitmap(
				blob as any,
				decodeOptions({ resizeWidth: target.width, resizeHeight: target.height, resizeQuality: 'high' }),
			)
			// The codec may ignore resize options: try the decoder at size
			// before falling back to the two-step resize of this bitmap.
			if (bitmap.width > max || bitmap.height > max) {
				try {
					const viaDecoder = await decodeWithDecoder(buffer, mime, target)
					try {
						bitmap.close?.()
					} catch {}
					return await fitToMax(viaDecoder, max)
				} catch {}
			}
			return await fitToMax(bitmap, max)
		} catch {}
		// Codec-level scaled decode where the implementation allows it.
		try {
			return await fitToMax(await decodeWithDecoder(buffer, mime, target), max)
		} catch {}
	}
	return fitToMax(await fullDecode(buffer, mime), max)
}

async function decodeWithDecoder(
	buffer: ArrayBuffer,
	mime: string,
	target: { width: number; height: number } | null,
): Promise<ImageBitmap> {
	const Decoder = (self as any).ImageDecoder
	if (typeof Decoder === 'undefined') throw new Error('no ImageDecoder')
	// Sizing lives in the constructor (both-or-neither, best-effort per
	// codec); decode() only takes frameIndex/completeFramesOnly and hands
	// back a VideoFrame. Skip codecs the implementation rejects so the
	// createImageBitmap-at-size path (Safari) runs instead.
	try {
		if (typeof Decoder.isTypeSupported === 'function' && !(await Decoder.isTypeSupported(mime))) {
			throw new Error(`ImageDecoder cannot decode ${mime}`)
		}
	} catch (e: any) {
		if (/cannot decode/.test(e?.message ?? '')) throw e
	}
	const init: any = { data: buffer, type: mime }
	if (target) {
		init.desiredWidth = target.width
		init.desiredHeight = target.height
	}
	const decoder = new Decoder(init)
	try {
		const { image } = (await decoder.decode()) as any
		try {
			return await createImageBitmap(image as any, decodeOptions()).catch(() => createImageBitmap(image as any))
		} finally {
			try {
				image.close?.()
			} catch {}
		}
	} finally {
		try {
			decoder.close?.()
		} catch {}
	}
}

async function fullDecode(buffer: ArrayBuffer, mime: string): Promise<ImageBitmap> {
	let bitmap: ImageBitmap | null = null
	if (typeof (self as any).ImageDecoder !== 'undefined') {
		try {
			bitmap = await decodeWithDecoder(buffer, mime, null)
		} catch {
			bitmap = null
		}
	}
	if (!bitmap) {
		const blob = new Blob([buffer], { type: mime } as any)
		try {
			bitmap = await createImageBitmap(blob as any, decodeOptions())
		} catch {
			bitmap = await createImageBitmap(blob as any)
		}
	}
	if (!bitmap) throw new Error('decode failed')
	return bitmap
}

async function fitToMax(bitmap: ImageBitmap, max: number): Promise<ImageBitmap> {
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
			return resized
		}
		if (typeof (self as any).OffscreenCanvas !== 'undefined') {
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
			return transferred
		}
		try {
			bitmap.close?.()
		} catch {}
		throw new Error('resize failed')
	}
	return bitmap
}
