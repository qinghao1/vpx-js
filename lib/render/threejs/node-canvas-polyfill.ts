// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Buffer } from 'node:buffer'

class FakeImageData {
	width: number
	height: number
	data: Uint8ClampedArray
	colorSpace = 'srgb'
	constructor(dataOrWidth: Uint8ClampedArray | number, width?: number, height?: number) {
		if (typeof dataOrWidth === 'number') {
			this.width = dataOrWidth
			this.height = width!
			this.data = new Uint8ClampedArray(this.width * this.height * 4)
		} else {
			this.data = dataOrWidth
			this.width = width!
			this.height = height!
		}
	}
}

class NodeFileReader {
	result: ArrayBuffer | string | null = null
	onloadend: (() => void) | null = null
	onerror: ((e: unknown) => void) | null = null
	readAsArrayBuffer(blob: Blob) {
		blob.arrayBuffer()
			.then(buf => {
				this.result = buf
				this.onloadend?.()
			})
			.catch(err => this.onerror?.(err))
	}
	readAsDataURL(blob: Blob) {
		blob.arrayBuffer()
			.then(buf => {
				const b64 = Buffer.from(buf).toString('base64')
				this.result = `data:${(blob as Blob).type || 'application/octet-stream'};base64,${b64}`
				this.onloadend?.()
			})
			.catch(err => this.onerror?.(err))
	}
}

class FakeContext2D {
	constructor(private readonly canvas: FakeCanvas) {}
	translate() {}
	scale() {}
	putImageData(imageData: ImageData, _x: number, _y: number) {
		this.canvas._setImageData(imageData as unknown as FakeImageData)
	}
	getImageData() {
		return this.canvas._getImageData()
	}
	drawImage() {}
}

class FakeCanvas {
	width = 1
	height = 1
	private _imageData: FakeImageData | null = null
	private _ctx: FakeContext2D | null = null
	getContext(type: string) {
		if (type !== '2d') return null
		if (!this._ctx) this._ctx = new FakeContext2D(this)
		return this._ctx
	}
	_setImageData(d: FakeImageData) {
		this._imageData = d
	}
	_getImageData() {
		return this._imageData
	}
	async _encode(mime: string): Promise<Blob> {
		const d = this._imageData
		if (!d) return new Blob([], { type: mime })
		const { data, width, height } = d
		const sharp = (await import('sharp')).default
		const raw = Buffer.from(data.buffer, data.byteOffset, data.byteLength)
		const pipeline = sharp(raw, { raw: { width, height, channels: 4 } })
		let buffer: Buffer
		if (mime === 'image/jpeg') buffer = await pipeline.jpeg({ quality: 92 }).toBuffer()
		else buffer = await pipeline.png().toBuffer()
		return new Blob([buffer as unknown as BlobPart], { type: mime })
	}
	toBlob(cb: (b: Blob | null) => void, mime = 'image/png') {
		this._encode(mime)
			.then(b => cb(b))
			.catch(() => cb(null))
	}
	convertToBlob(opts: { type: string; quality?: number }) {
		return this._encode(opts.type)
	}
	toDataURL() {
		throw new Error('FakeCanvas.toDataURL not supported in Node — use binary GLB export')
	}
}

let installed = false

export function ensureNodeCanvasPolyfill() {
	if (installed) return
	installed = true
	const g = globalThis as unknown as Record<string, unknown>
	if (!g.ImageData) g.ImageData = FakeImageData as unknown as typeof ImageData
	if (!g.FileReader) g.FileReader = NodeFileReader as unknown as typeof FileReader
	if (!g.document) {
		const createElement = (tag: string) => {
			if (tag.toLowerCase() === 'canvas') return new FakeCanvas() as unknown as HTMLElement
			return { style: {} } as unknown as HTMLElement
		}
		g.document = {
			createElement,
			createElementNS: (_ns: string, tag: string) => createElement(tag),
		} as unknown as Document
	}
}
