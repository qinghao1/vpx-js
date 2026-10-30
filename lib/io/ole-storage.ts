// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { StorageEntry } from './ole-directory-tree.js'
import type { OleCompoundDoc, ReadResult } from './ole-doc.js'

/** OLE storage/stream accessor.
 * @see https://github.com/vpinball/vpinball/blob/master/third-party/include/pole/pole.cpp */
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

	public async streamFiltered(
		name: string,
		offset: number,
		next: (r: ReadResult) => Promise<number | null>,
	): Promise<void> {
		const e = this.dirEntry.streams[name]
		if (!e) throw new Error(`No such stream "${name}" in document.`)
		if (offset >= e.size) return
		const total = e.size - offset
		const { shortStream, secSize, secIds, secOffset, innerOffset } = this.sectorInfo(e, offset)
		const needed = secIds.slice(secOffset, secOffset + Math.ceil((innerOffset + total) / secSize))
		const buf = shortStream
			? await this.doc.readShortSectors(needed, innerOffset, total)
			: await this.doc.readSectors(needed, innerOffset, total)
		let pos = 0
		while (pos < buf.length) {
			const slice = buf.subarray(pos)
			if (slice.length < 4) break
			const result: ReadResult = { data: slice, storageOffset: offset + pos }
			const len = await next(result)
			// buf already spans offset..end of stream, so a record demanding
			// more bytes overruns the stream (upstream BiffReader fails the
			// load on a short read): reject instead of re-reading sectors.
			if (len !== null && len < 0)
				throw new Error(
					`Corrupt BIFF record: declares ${-len} bytes but only ${slice.length} remain in stream "${name}".`,
				)
			if (len === null) break
			pos += len
			// A streamed record (CODE) sizes itself from its cchar; an advance past
			// the stream end means the length overran the stream (upstream AsScript
			// fails the load on a short read), so reject instead of recording it.
			if (pos > buf.length)
				throw new Error(`Corrupt BIFF record: extends ${pos - buf.length} bytes past end of stream "${name}".`)
		}
	}

	public async read(key: string, offset = 0, bytesToRead?: number): Promise<Uint8Array> {
		const e = this.dirEntry.streams[key]
		if (!e) throw new Error(`No such stream "${key}".`)
		// Explicit 0 reads nothing (e.g. empty CODE cchar); omitted length reads to end.
		bytesToRead ??= e.size - offset
		if (bytesToRead <= 0) return new Uint8Array(0)
		const { shortStream, secSize, secIds, secOffset, innerOffset } = this.sectorInfo(e, offset)
		const needed = secIds.slice(secOffset, secOffset + Math.ceil((innerOffset + bytesToRead) / secSize))
		return shortStream
			? this.doc.readShortSectors(needed, innerOffset, bytesToRead)
			: this.doc.readSectors(needed, innerOffset, bytesToRead)
	}

	private sectorInfo(e: StorageEntry, offset: number) {
		const shortStream = e.size < this.doc.header.shortStreamMax
		const secSize = shortStream ? this.doc.header.shortSecSize : this.doc.header.secSize
		const secIds = (shortStream ? this.doc.SSAT : this.doc.SAT).getChainForEntry(e)
		const secOffset = Math.floor(offset / secSize)
		const innerOffset = offset % secSize
		return { shortStream, secSize, secIds, secOffset, innerOffset }
	}
}
