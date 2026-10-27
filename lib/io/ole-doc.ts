// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EventEmitter } from '../util/event-emitter.js'
import { getDataView } from './binary-helpers.js'
import { AllocationTable } from './ole-allocation-table.js'
import { DirectoryTree } from './ole-directory-tree.js'
import { Header } from './ole-header.js'
import { Storage } from './ole-storage.js'

export { AllocationTable } from './ole-allocation-table.js'
export type { StorageEntry } from './ole-directory-tree.js'
export { DirectoryTree } from './ole-directory-tree.js'
export { Header } from './ole-header.js'
export { Storage } from './ole-storage.js'

/** OLE compound document (VPX container). */
export class OleCompoundDoc extends EventEmitter {
	header!: Header
	SAT!: AllocationTable
	SSAT!: AllocationTable

	private readonly reader: IBinaryReader
	private rootStorage!: Storage
	private loaded = false
	private MSAT: number[] = []
	private shortStreamSecIds: number[] = []
	private directoryTree?: DirectoryTree

	private constructor(reader: IBinaryReader) {
		super()
		this.reader = reader
	}

	/** Loads document from reader. */
	static async load(reader: IBinaryReader): Promise<OleCompoundDoc> {
		const doc = new OleCompoundDoc(reader)
		try {
			await doc.openFile()
			await doc.readAll()
		} catch (err) {
			await doc.close()
			throw err
		}
		return doc
	}

	private async readAll(): Promise<void> {
		await this.readHeader()
		await this.readMSAT()
		await this.readSAT()
		await this.readSSAT()
		await this.readDirectoryTree()
		this.loaded = true
	}

	/** Reopens underlying reader. */
	async reopen(): Promise<void> {
		await this.openFile()
	}

	/** Returns storage by name. */
	storage(name: string): Storage {
		this.assertLoaded()
		return this.rootStorage.storage(name)
	}

	/** Reads one sector. */
	async readSector(secId: number, offset = 0, bytesToRead?: number): Promise<Uint8Array> {
		return this.readSectors([secId], offset, bytesToRead)
	}

	/** Reads sectors (coalesces contiguous runs for I/O efficiency). */
	async readSectors(secIds: number[], offset = 0, bytesToRead?: number): Promise<Uint8Array> {
		return this.readSectorIds(secIds, offset, bytesToRead, this.header.secSize, id => this.getFileOffsetForSec(id))
	}

	/** Reads short sectors. */
	async readShortSectors(secIds: number[], offset = 0, bytesToRead?: number): Promise<Uint8Array> {
		return this.readSectorIds(secIds, offset, bytesToRead, this.header.shortSecSize, id =>
			this.getFileOffsetForShortSec(id),
		)
	}

	private async readSectorIds(
		secIds: number[],
		offset: number,
		bytesToRead: number | undefined,
		secSize: number,
		getOff: (id: number) => number,
	): Promise<Uint8Array> {
		// An explicit 0 is an empty read; only an omitted length reads everything.
		bytesToRead = Math.min(secIds.length * secSize, bytesToRead ?? secIds.length * secSize)
		this.assertLoaded()
		const mem = this.reader.getData?.()

		const out = new Uint8Array(bytesToRead)
		let i = 0,
			outOff = 0,
			off = offset,
			remaining = bytesToRead
		while (i < secIds.length && remaining > 0) {
			if (off >= secSize) {
				off -= secSize
				i++
				continue
			}
			const firstLen = Math.min(secSize - off, remaining)
			let runLen = 1,
				runBytes = firstLen
			while (i + runLen < secIds.length && remaining - runBytes > 0) {
				if (getOff(secIds[i + runLen - 1]) + secSize !== getOff(secIds[i + runLen])) break
				const next = Math.min(secSize, remaining - runBytes)
				runBytes += next
				runLen++
				if (next < secSize) break
			}
			const fileOff = off + getOff(secIds[i])
			const toRead = Math.min(runBytes, remaining)
			// Short reads past EOF leave the zero-initialized tail in place,
			// matching pole's zeroed buffers.
			if (mem) out.set(mem.subarray(fileOff, fileOff + toRead), outOff)
			else await this.reader.read(out, outOff, toRead, fileOff)
			outOff += toRead
			remaining -= toRead
			off = 0
			i += runLen
		}
		return out
	}

	/** Closes reader. */
	async close(): Promise<void> {
		await this.reader.close()
	}

	private assertLoaded(): void {
		// Loadedness outlives the reader: memory-backed readers retain their
		// bytes after close so post-load streaming keeps working.
		if (!this.loaded && !this.reader.isOpen()) throw new Error('Document must be loaded first.')
		// A closed reader without retained bytes cannot serve reads: fail here
		// instead of taking the reader.read path on a closed reader.
		if (this.loaded && !this.reader.isOpen() && !this.reader.getData?.()) throw new Error('Document is closed.')
	}

	private async openFile(): Promise<void> {
		await this.reader.open()
	}

	private async readHeader(): Promise<void> {
		const buf = new Uint8Array(512)
		const [n, data] = await this.reader.read(buf, 0, 512, 0)
		this.header = Header.load(data.slice(0, n))
	}

	private async readMSAT(): Promise<void> {
		this.MSAT = this.header.partialMSAT.slice(0)
		this.MSAT.length = this.header.SATSize
		if (this.header.SATSize <= 109 || !this.header.MSATSize) {
			this.assertMSATComplete()
			return
		}
		const seenSectors = new Set<number>()
		let secId = this.header.MSATSecId
		let idx = 109
		for (let difatIndex = 0; difatIndex < this.header.MSATSize; difatIndex++) {
			if (!Number.isInteger(secId) || secId < 0)
				throw new Error(`Corrupt file: invalid DIFAT sector id ${secId}.`)
			if (seenSectors.has(secId))
				throw new Error(`Corrupt file: cycle detected in DIFAT chain at sector ${secId}.`)
			seenSectors.add(secId)
			const sector = await this.readSector(secId)
			const view = getDataView(sector)
			for (let offset = 0; offset < this.header.secSize - 4; offset += 4) {
				if (idx >= this.header.SATSize) break
				this.MSAT[idx++] = view.getInt32(offset, true)
			}
			secId = view.getInt32(this.header.secSize - 4, true)
		}
		this.assertMSATComplete()
	}

	private assertMSATComplete(): void {
		for (let entryIndex = 0; entryIndex < this.header.SATSize; entryIndex++) {
			const entry = this.MSAT[entryIndex]
			if (!Number.isInteger(entry) || entry < 0)
				throw new Error(`Corrupt file: invalid MSAT entry ${String(entry)} at index ${entryIndex}.`)
		}
	}

	private async readSAT(): Promise<void> {
		this.SAT = await AllocationTable.load(this, this.MSAT)
	}

	private async readSSAT(): Promise<void> {
		const ids = this.SAT.getSecIdChain(this.header.SSATSecId)
		if (ids.length !== this.header.SSATSize) throw new Error('Invalid Short Sector Allocation Table')
		this.SSAT = await AllocationTable.load(this, ids)
	}

	private async readDirectoryTree(): Promise<void> {
		const ids = this.SAT.getSecIdChain(this.header.dirSecId)
		this.directoryTree = await DirectoryTree.load(this, ids)
		this.rootStorage = new Storage(this, this.directoryTree.root)
		this.shortStreamSecIds = this.SAT.getSecIdChain(this.directoryTree.root.secId)
	}

	private getFileOffsetForSec(secId: number): number {
		return (secId + 1) * this.header.secSize
	}

	private getFileOffsetForShortSec(id: number): number {
		const shortSize = this.header.shortSecSize
		const off = id * shortSize
		const secSize = this.header.secSize
		const idx = Math.floor(off / secSize)
		if (!Number.isInteger(id) || id < 0 || idx < 0 || idx >= this.shortStreamSecIds.length)
			throw new Error(
				`Corrupt file: mini sector ${id} beyond short stream of ${this.shortStreamSecIds.length} sectors.`,
			)
		const secId = this.shortStreamSecIds[idx]
		if (!Number.isInteger(secId) || secId < 0)
			throw new Error(`Corrupt file: invalid short-stream sector id ${String(secId)}.`)
		return this.getFileOffsetForSec(secId) + (off % secSize)
	}
}

/** Reader result. */
export interface ReadResult {
	data: Uint8Array
	storageOffset: number
}

/** Minimal binary reader contract. */
export interface IBinaryReader {
	read(target: Uint8Array, offset: number, length: number, position: number): Promise<[number, Uint8Array]>
	open(): Promise<void>
	close(): Promise<void>
	isOpen(): boolean
	/** In-memory image for readers that hold all bytes; lets the doc copy without I/O. */
	getData?(): Uint8Array | undefined
}
