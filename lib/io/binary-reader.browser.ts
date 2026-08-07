// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { IBinaryReader } from './ole-doc.js'

export class BrowserBinaryReader implements IBinaryReader {
	private readonly blob: Blob
	private data!: Uint8Array

	constructor(blob: Blob) {
		this.blob = blob
	}

	public read(target: Uint8Array, offset: number, length: number, position: number): Promise<[number, Uint8Array]> {
		const slice = this.data.subarray(position, position + length)
		target.set(slice, offset)
		const copy = typeof structuredClone !== 'undefined' ? structuredClone(slice as any) : new Uint8Array(slice)
		return Promise.resolve([length, copy as Uint8Array])
	}

	public close(): Promise<void> {
		;(this as any).data = undefined
		return Promise.resolve()
	}

	public isOpen(): boolean {
		return !!(this as any).data
	}

	public async open(): Promise<void> {
		const ab = (await (this.blob as any).arrayBuffer?.()) ?? (await new Response(this.blob as Blob).arrayBuffer())
		this.data = new Uint8Array(ab)
	}
}
