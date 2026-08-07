// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { concatUint8Arrays } from './binary-helpers.js'
import { readableStream } from './event-stream.js'
import type { StorageEntry } from './ole-directory-tree.js'
import type { OleCompoundDoc, ReadResult } from './ole-doc.js'

/** OLE storage/stream accessor.
 * @see https://github.com/vpinball/vpinball/blob/master/ole-doc.cpp */
export class Storage {
	constructor(
		private readonly doc: OleCompoundDoc,
		private readonly dirEntry: StorageEntry,
	) {}

	public storage(name: string): Storage {
		const e = this.dirEntry.storages[name]
		if (!e) throw new Error(`No such storage "${name}".`)
		return new Storage(this.doc, e)
	}

	public getStreams(): string[] {
		return Object.keys(this.dirEntry.streams)
	}

	public stream(name: string, offset = 0, bytesToRead = 0) {
		const e = this.dirEntry.streams[name]
		if (!e) return null
		bytesToRead ||= e.size - offset
		if (bytesToRead <= 0) return readableStream(async (s): Promise<Uint8Array | null> => (s.emit('end'), null))
		const { shortStream, secSize, secIds, secOffset, innerOffset } = this.sectorInfo(e, offset, bytesToRead)
		const needed = secIds.slice(secOffset, secOffset + Math.ceil((innerOffset + bytesToRead) / secSize))
		let cached: Uint8Array | null = null
		let pos = 0
		return readableStream(async (s): Promise<Uint8Array | null> => {
			try {
				cached ??= shortStream
					? await this.doc.readShortSectors(needed, innerOffset, bytesToRead)
					: await this.doc.readSectors(needed, innerOffset, bytesToRead)
				if (pos >= cached.length) return s.emit('end'), null
				const chunk = cached.subarray(pos, pos + secSize)
				pos += chunk.length
				return new Uint8Array(chunk)
			} catch (err) {
				s.emit('error', err as Error)
				s.emit('end')
				return null
			}
		})
	}

	public async streamFiltered(
		name: string,
		offset: number,
		next: (r: ReadResult) => Promise<number | null>,
	): Promise<void> {
		const e = this.dirEntry.streams[name]
		if (!e) throw new Error(`No such stream "${name}" in document.`)
		if (offset >= e.size) return
		const total = e.size - offset
		const { shortStream, secSize, secIds, secOffset, innerOffset } = this.sectorInfo(e, offset, total)
		const needed = secIds.slice(secOffset, secOffset + Math.ceil((innerOffset + total) / secSize))
		let buf = shortStream
			? await this.doc.readShortSectors(needed, innerOffset, total)
			: await this.doc.readSectors(needed, innerOffset, total)
		let pos = 0
		while (pos < buf.length) {
			const slice = buf.subarray(pos)
			if (slice.length < 4) break
			const result: ReadResult = { data: slice, storageOffset: offset + pos }
			let len = await next(result)
			if (len !== null && len < 0) {
				const remaining = -len - slice.length
				const need = Math.ceil(remaining / secSize)
				if (remaining > e.size - (offset + pos))
					throw new Error(`Cannot read ${remaining} when only ${e.size - (offset + pos)} remain.`)
				const missOff = secOffset + Math.floor((innerOffset + pos + slice.length) / secSize)
				const missIds = secIds.slice(missOff, missOff + need)
				const miss = shortStream
					? await this.doc.readShortSectors(missIds, 0, remaining)
					: await this.doc.readSectors(missIds, 0, remaining)
				result.data = concatUint8Arrays(result.data, miss)
				len = await next(result)
			}
			if (len === null) break
			if (len < 0) throw new Error('Second negative len not supported')
			pos += len
		}
	}

	public async read(key: string, offset = 0, bytesToRead = 0): Promise<Uint8Array> {
		const e = this.dirEntry.streams[key]
		if (!e) throw new Error(`No such stream "${key}".`)
		bytesToRead ||= e.size - offset
		if (bytesToRead <= 0) return new Uint8Array(0)
		const { shortStream, secSize, secIds, secOffset, innerOffset } = this.sectorInfo(e, offset, bytesToRead)
		const needed = secIds.slice(secOffset, secOffset + Math.ceil((innerOffset + bytesToRead) / secSize))
		return shortStream
			? this.doc.readShortSectors(needed, innerOffset, bytesToRead)
			: this.doc.readSectors(needed, innerOffset, bytesToRead)
	}

	private sectorInfo(e: StorageEntry, offset: number, bytes: number) {
		const shortStream = e.size < this.doc.header.shortStreamMax
		const secSize = shortStream ? this.doc.header.shortSecSize : this.doc.header.secSize
		const secIds = (shortStream ? this.doc.SSAT : this.doc.SAT).getSecIdChain(e.secId)
		const secOffset = Math.floor(offset / secSize)
		const innerOffset = offset % secSize
		return { shortStream, secSize, secIds, secOffset, innerOffset }
	}
}
