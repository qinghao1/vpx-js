// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { concatUint8Arrays, getDataView } from './binary-helpers.js'
import { readableStream } from './event-stream.js'
import type { StorageEntry } from './ole-directory-tree.js'
import type { OleCompoundDoc, ReadResult } from './ole-doc.js'

/** OLE storage/stream accessor. */
export class Storage {
	private readonly doc: OleCompoundDoc
	private readonly dirEntry: StorageEntry

	constructor(doc: OleCompoundDoc, dirEntry: StorageEntry) {
		this.doc = doc
		this.dirEntry = dirEntry
	}

	public storage(storageName: string): Storage {
		if (!this.dirEntry.storages[storageName]) {
			throw new Error(`No such storage "${storageName}".`)
		}
		return new Storage(this.doc, this.dirEntry.storages[storageName])
	}

	public getStreams(): string[] {
		return Object.keys(this.dirEntry.streams)
	}

	public stream(streamName: string, offset = 0, bytesToRead = 0) {
		const entry = this.dirEntry.streams[streamName]
		if (!entry) return null
		bytesToRead = bytesToRead || entry.size - offset
		if (bytesToRead <= 0) {
			return readableStream(async (s): Promise<Uint8Array | null> => {
				s.emit('end')
				return null
			})
		}
		const shortStream = entry.size < this.doc.header.shortStreamMax
		const secSize = shortStream ? this.doc.header.shortSecSize : this.doc.header.secSize
		const table = shortStream ? this.doc.SSAT : this.doc.SAT
		const secIds = table.getSecIdChain(entry.secId)
		const secOffset = Math.floor(offset / secSize)
		const innerOffset = offset - secOffset * secSize
		const numSecs = Math.ceil((innerOffset + bytesToRead) / secSize)
		const neededIds = secIds.slice(secOffset, secOffset + numSecs)
		let cached: Uint8Array | null = null
		let pos = 0
		return readableStream(async (s): Promise<Uint8Array | null> => {
			try {
				if (!cached) {
					cached = shortStream
						? await this.doc.readShortSectors(neededIds, innerOffset, bytesToRead)
						: await this.doc.readSectors(neededIds, innerOffset, bytesToRead)
				}
				if (pos >= cached.length) {
					s.emit('end')
					return null
				}
				const chunk = cached.subarray(pos, pos + secSize)
				const copy = new Uint8Array(chunk)
				pos += chunk.length
				return copy
			} catch (err) {
				s.emit('error', err as Error)
				s.emit('end')
				return null
			}
		})
	}

	public async streamFiltered(
		streamName: string,
		offset: number,
		next: (data: ReadResult) => Promise<number | null>,
	): Promise<void> {
		const entry = this.dirEntry.streams[streamName]
		if (!entry) throw new Error(`No such stream "${streamName}" in document.`)
		const bytes = entry.size
		if (offset >= bytes) return
		const shortStream = bytes < this.doc.header.shortStreamMax
		const secSize = shortStream ? this.doc.header.shortSecSize : this.doc.header.secSize
		const table = shortStream ? this.doc.SSAT : this.doc.SAT
		const secIds = table.getSecIdChain(entry.secId)
		const totalRemaining = bytes - offset
		const secOffset = Math.floor(offset / secSize)
		const innerOffset = offset % secSize
		const numSecs = Math.ceil((innerOffset + totalRemaining) / secSize)
		const neededIds = secIds.slice(secOffset, secOffset + numSecs)
		let buffer = shortStream
			? await this.doc.readShortSectors(neededIds, innerOffset, totalRemaining)
			: await this.doc.readSectors(neededIds, innerOffset, totalRemaining)
		let pos = 0
		let storageOffset = offset
		while (pos < buffer.length) {
			const resultBuffer = buffer.subarray(pos)
			if (resultBuffer.length < 4) break
			const result: ReadResult = { data: resultBuffer, storageOffset: storageOffset + pos }
			let len = await next(result)
			if (len !== null && len < 0) {
				const remainingLen = -len - resultBuffer.length
				const need = Math.ceil(remainingLen / secSize)
				if (remainingLen > bytes - (storageOffset + pos)) {
					throw new Error(`Cannot read ${remainingLen} when only ${bytes - (storageOffset + pos)} remain.`)
				}
				const missOffset = secOffset + Math.floor((innerOffset + pos + resultBuffer.length) / secSize)
				const missIds = secIds.slice(missOffset, missOffset + need)
				const missing = shortStream
					? await this.doc.readShortSectors(missIds, 0, remainingLen)
					: await this.doc.readSectors(missIds, 0, remainingLen)
				result.data = concatUint8Arrays(result.data, missing)
				len = await next(result)
			}
			if (len === null) break
			if (len < 0) throw new Error('Second negative len not supported')
			pos += len
		}
	}

	public async read(key: string, offset = 0, bytesToRead = 0): Promise<Uint8Array> {
		const entry = this.dirEntry.streams[key]
		if (!entry) throw new Error(`No such stream "${key}".`)
		bytesToRead = bytesToRead || entry.size - offset
		if (bytesToRead <= 0) return new Uint8Array(0)
		const shortStream = entry.size < this.doc.header.shortStreamMax
		const secSize = shortStream ? this.doc.header.shortSecSize : this.doc.header.secSize
		const table = shortStream ? this.doc.SSAT : this.doc.SAT
		const secIds = table.getSecIdChain(entry.secId)
		const secOffset = Math.floor(offset / secSize)
		const innerOffset = offset % secSize
		const numSecs = Math.ceil((innerOffset + bytesToRead) / secSize)
		const neededIds = secIds.slice(secOffset, secOffset + numSecs)
		return shortStream
			? this.doc.readShortSectors(neededIds, innerOffset, bytesToRead)
			: this.doc.readSectors(neededIds, innerOffset, bytesToRead)
	}
}
