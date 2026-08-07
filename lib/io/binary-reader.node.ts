// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { close, open, read } from 'node:fs'
import type { IBinaryReader } from './ole-doc.js'

/** Node file reader for VPX. */
export class NodeBinaryReader implements IBinaryReader {
	private readonly filename: string
	private fd = 0

	constructor(filename: string) {
		this.filename = filename
	}

	public read(target: Uint8Array, offset: number, length: number, position: number): Promise<[number, Uint8Array]> {
		return new Promise((resolve, reject) => {
			read(this.fd, target as any, offset, length, position, (err: any, bytesRead: number, data: any) => {
				if (err) return reject(err)
				let result: Uint8Array =
					data instanceof Uint8Array
						? (data as Uint8Array)
						: new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
				const cloned =
					typeof structuredClone !== 'undefined'
						? structuredClone(result.subarray(0, bytesRead) as any)
						: result.slice(0, bytesRead)
				resolve([bytesRead, cloned as Uint8Array])
			})
		})
	}

	public async close(): Promise<void> {
		if (this.fd) await new Promise<void>((resolve, reject) => close(this.fd, (err) => (err ? reject(err) : resolve())))
		this.fd = 0
	}

	public async open(): Promise<void> {
		this.fd = await new Promise<number>((resolve, reject) =>
			open(this.filename, 'r', 0o666, (err, fd) => (err ? reject(err) : resolve(fd))),
		)
	}

	public isOpen(): boolean {
		return !!this.fd
	}
}
