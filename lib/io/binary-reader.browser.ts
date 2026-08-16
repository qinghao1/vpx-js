// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { IBinaryReader } from './ole-doc.js'

/** Reads a VPX blob in the browser — keeps single Uint8Array, supports reopen. */
export class BrowserBinaryReader implements IBinaryReader {
	private data?: Uint8Array
	private _isOpen = false

	constructor(private blob?: Blob | Uint8Array | ArrayBuffer) {}

	public read(target: Uint8Array, offset: number, length: number, position: number): Promise<[number, Uint8Array]> {
		if (!this.data) throw new Error('BrowserBinaryReader not open')
		const slice = this.data.subarray(position, position + length)
		target.set(slice, offset)
		return Promise.resolve([length, target.subarray(offset, offset + length)])
	}

	public close(): Promise<void> {
		this._isOpen = false
		return Promise.resolve()
	}

	public release(): Promise<void> {
		this._isOpen = false
		;(this as unknown as { data: Uint8Array | undefined }).data = undefined
		this.blob = undefined
		return Promise.resolve()
	}

	public isOpen(): boolean {
		return this._isOpen || !!this.data
	}

	public async open(): Promise<void> {
		if (this._isOpen && this.data) return
		if (this.data && !this.blob) {
			this._isOpen = true
			return
		}
		if (!this.blob) throw new Error('BrowserBinaryReader: blob already consumed and data not available')
		const src: any = this.blob
		if (src instanceof Uint8Array) {
			this.data = src
			this.blob = undefined
			this._isOpen = true
			return
		}
		if (src instanceof ArrayBuffer) {
			this.data = new Uint8Array(src)
			this.blob = undefined
			this._isOpen = true
			return
		}
		if (src instanceof Blob) {
			const b = src as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> }
			const ab = (await b.arrayBuffer?.()) ?? (await new Response(b).arrayBuffer())
			this.data = new Uint8Array(ab)
			this.blob = undefined
			this._isOpen = true
			return
		}
		throw new Error('BrowserBinaryReader: unsupported blob type')
	}
}
