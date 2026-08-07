// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { close as closeCb, open as openCb, read as readCb } from 'node:fs'
import type { IBinaryReader } from './ole-doc.js'

/** Node file reader for VPX. */
export class NodeBinaryReader implements IBinaryReader {
	private fd = 0

	constructor(private readonly filename: string) {}

	public read(target: Uint8Array, offset: number, length: number, position: number): Promise<[number, Uint8Array]> {
		return new Promise((resolve, reject) => {
			readCb(this.fd, target as unknown as Buffer, offset, length, position, (err, bytesRead, buffer) => {
				if (err) return reject(err)
				const cloned =
					typeof structuredClone !== 'undefined'
						? structuredClone(buffer.subarray(0, bytesRead))
						: buffer.slice(0, bytesRead)
				resolve([bytesRead, cloned as Uint8Array])
			})
		})
	}

	public async close(): Promise<void> {
		if (this.fd)
			await new Promise<void>((resolve, reject) => closeCb(this.fd, (err) => (err ? reject(err) : resolve())))
		this.fd = 0
	}

	public async open(): Promise<void> {
		this.fd = await new Promise<number>((resolve, reject) =>
			openCb(this.filename, 'r', 0o666, (err, fd) => (err ? reject(err) : resolve(fd))),
		)
	}

	public isOpen(): boolean {
		return !!this.fd
	}
}
