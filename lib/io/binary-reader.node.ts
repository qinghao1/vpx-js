// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { readFile } from 'node:fs/promises'
import type { IBinaryReader } from './ole-doc.js'

/** Node file reader for VPX — single-buffer zero-copy (memory-mapped style). */
export class NodeBinaryReader implements IBinaryReader {
	private data?: Uint8Array
	private _isOpen = false

	constructor(private readonly filename: string) {}

	public read(target: Uint8Array, offset: number, length: number, position: number): Promise<[number, Uint8Array]> {
		if (!this.data) throw new Error('NodeBinaryReader not open')
		const slice = this.data.subarray(position, position + length)
		target.set(slice, offset)
		return Promise.resolve([slice.length, target.subarray(offset, offset + slice.length)])
	}

	public async close(): Promise<void> {
		this._isOpen = false
	}

	public async release(): Promise<void> {
		this._isOpen = false
		this.data = undefined
	}

	public async open(): Promise<void> {
		if (this._isOpen && this.data) return
		if (this.data) {
			this._isOpen = true
			return
		}
		const buf = await readFile(this.filename)
		this.data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
		this._isOpen = true
	}

	public isOpen(): boolean {
		return this._isOpen || !!this.data
	}
}
