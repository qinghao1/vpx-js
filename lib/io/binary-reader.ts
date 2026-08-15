// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { IBinaryReader } from './ole-doc.js'

/** Isomorphic in-memory binary reader for VPX — works in Node 24+ and modern browsers. */
export class BinaryReader implements IBinaryReader {
	private data?: Uint8Array
	private _isOpen = false

	constructor(private blob?: Blob | Uint8Array | ArrayBuffer | DataView) {}

	public read(target: Uint8Array, offset: number, length: number, position: number): Promise<[number, Uint8Array]> {
		if (!this.data) throw new Error('BinaryReader not open')
		const slice = this.data.subarray(position, position + length)
		target.set(slice, offset)
		const copy =
			typeof structuredClone !== 'undefined'
				? structuredClone(slice as unknown as Uint8Array)
				: new Uint8Array(slice)
		return Promise.resolve([length, copy as Uint8Array])
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

	public async open(): Promise<void> {
		if (this._isOpen && this.data) return
		if (this.data && !this.blob) {
			this._isOpen = true
			return
		}
		if (!this.blob) throw new Error('BinaryReader: data already consumed and not available')
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
		if (src instanceof DataView) {
			this.data = new Uint8Array(src.buffer, src.byteOffset, src.byteLength)
			this.blob = undefined
			this._isOpen = true
			return
		}
		if (typeof Blob !== 'undefined' && src instanceof Blob) {
			this.data = new Uint8Array(await src.arrayBuffer())
			this.blob = undefined
			this._isOpen = true
			return
		}
		throw new Error('Unsupported binary data source')
	}
}

export { BinaryReader as BrowserBinaryReader }
