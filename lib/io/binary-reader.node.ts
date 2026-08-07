// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { close, open, read } from 'node:fs'
import type { IBinaryReader } from './ole-doc.js'

export class NodeBinaryReader implements IBinaryReader {
	private readonly filename: string
	private fd: number = 0

	constructor(filename: string) {
		this.filename = filename
	}

	public read(target: Uint8Array, offset: number, length: number, position: number): Promise<[number, Uint8Array]> {
		return new Promise((resolve, reject) => {
			read(this.fd, target as any, offset, length, position, (err: any, bytesRead: number, data: any) => {
				/* istanbul ignore if */
				if (err) {
					reject(err)
					return
				}
				// data may be Buffer or Uint8Array; ensure Uint8Array
				let result: Uint8Array
				if (data instanceof Uint8Array) {
					result = data as Uint8Array
				} else {
					result = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
				}
				// structuredClone to detach if caller expects isolated copy
				const cloned =
					typeof structuredClone !== 'undefined'
						? structuredClone(result.subarray(0, bytesRead) as any)
						: result.slice(0, bytesRead)
				resolve([bytesRead, cloned as Uint8Array])
			})
		})
	}

	public async close(): Promise<void> {
		if (this.fd) {
			await new Promise<void>((resolve, reject) => {
				close(this.fd, (err) => {
					if (err) {
						reject(err)
						return
					}
					resolve()
				})
			})
		}
		this.fd = 0
	}

	public async open(): Promise<void> {
		this.fd = await new Promise<number>((resolve, reject) => {
			open(this.filename, 'r', 0o666, (err, fd) => {
				if (err) {
					reject(err)
					return
				}
				resolve(fd)
			})
		})
	}

	public isOpen(): boolean {
		return !!this.fd
	}
}
