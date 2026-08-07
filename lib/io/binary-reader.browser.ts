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

import type { IBinaryReader } from './ole-doc'

export class BrowserBinaryReader implements IBinaryReader {
	private readonly blob: Blob
	private data!: Uint8Array

	constructor(blob: Blob) {
		this.blob = blob
	}

	public read(buffer: Buffer, offset: number, length: number, position: number): Promise<[number, Buffer]> {
		const slice = this.data.subarray(position, position + length)
		;(buffer as unknown as Uint8Array).set(slice, offset)
		return Promise.resolve([length, Buffer.from(slice)])
	}

	public close(): Promise<void> {
		delete this.data
		return Promise.resolve()
	}

	public isOpen(): boolean {
		return true
	}

	public async open(): Promise<void> {
		const ab = (await (this.blob as any).arrayBuffer?.()) ?? (await new Response(this.blob).arrayBuffer())
		this.data = new Uint8Array(ab)
	}
}
