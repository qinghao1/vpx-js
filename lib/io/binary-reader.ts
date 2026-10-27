// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { readFromMemory } from './binary-helpers.js'
import type { IBinaryReader } from './ole-doc.js'

/** Isomorphic in-memory binary reader for VPX — works in Node 24+ and modern browsers. */
export class BinaryReader implements IBinaryReader {
	private data?: Uint8Array
	private _isOpen = false

	constructor(private blob?: Blob | Uint8Array | ArrayBuffer | DataView) {}

	public read(target: Uint8Array, offset: number, length: number, position: number): Promise<[number, Uint8Array]> {
		return readFromMemory(this.data, 'BinaryReader not open', target, offset, length, position)
	}

	public close(): Promise<void> {
		this._isOpen = false
		return Promise.resolve()
	}

	public release(): Promise<void> {
		this._isOpen = false
		this.data = undefined
		this.blob = undefined
		return Promise.resolve()
	}

	public isOpen(): boolean {
		return this._isOpen || !!this.data
	}

	/** In-memory image for zero-copy sector reads; retained after close. */
	public getData(): Uint8Array | undefined {
		return this.data
	}

	public async open(): Promise<void> {
		if (this._isOpen && this.data) return
		if (this.data && !this.blob) {
			this._isOpen = true
			return
		}
		if (!this.blob) throw new Error('BinaryReader: data already consumed and not available')
		const src: any = this.blob
		if (src instanceof Uint8Array) this.data = src
		else if (src instanceof ArrayBuffer) this.data = new Uint8Array(src)
		else if (src instanceof DataView) this.data = new Uint8Array(src.buffer, src.byteOffset, src.byteLength)
		else if (typeof Blob !== 'undefined' && src instanceof Blob) this.data = new Uint8Array(await src.arrayBuffer())
		else throw new Error('Unsupported binary data source')
		this.blob = undefined
		this._isOpen = true
	}
}

export { BinaryReader as BrowserBinaryReader }
