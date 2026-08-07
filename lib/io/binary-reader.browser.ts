// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { IBinaryReader } from './ole-doc.js'

/** Reads a VPX blob in the browser. High-memory optimized: keeps single Uint8Array, supports reopen without blob. */
export class BrowserBinaryReader implements IBinaryReader {
	private blob: Blob | undefined
	private data: Uint8Array | undefined
	private _isOpen = false

	constructor(blob: Blob) {
		this.blob = blob
	}

	public read(target: Uint8Array, offset: number, length: number, position: number): Promise<[number, Uint8Array]> {
		if (!this.data) throw new Error('BrowserBinaryReader not open')
		const slice = this.data.subarray(position, position + length)
		target.set(slice, offset)
		const copy = typeof structuredClone !== 'undefined' ? structuredClone(slice as any) : new Uint8Array(slice)
		return Promise.resolve([length, copy as Uint8Array])
	}

	public close(): Promise<void> {
		this._isOpen = false
		return Promise.resolve()
	}

	public release(): Promise<void> {
		this._isOpen = false
		;(this as any).data = undefined
		this.blob = undefined as any
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
		const b = this.blob as Blob
		const ab = (await (b as any).arrayBuffer?.()) ?? (await new Response(b as Blob).arrayBuffer())
		this.data = new Uint8Array(ab)
		this.blob = undefined as any
		this._isOpen = true
	}
}
