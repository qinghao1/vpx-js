/*
 * VPDB - Virtual Pinball Database
 * Copyright (C) 2019 freezy <freezy@vpdb.io>
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 */

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
