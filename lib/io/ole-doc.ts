// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EventEmitter } from 'events'
import { getDataView } from './binary-helpers.js'
import { AllocationTable } from './ole-allocation-table.js'
import { DirectoryTree, type StorageEntry } from './ole-directory-tree.js'
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
	private skipBytes = 0
	private rootStorage!: Storage
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
			await doc.readHeader()
			await doc.readMSAT()
			await doc.readSAT()
			await doc.readSSAT()
			await doc.readDirectoryTree()
		} catch (err) {
			await doc.close()
			throw err
		}
		return doc
	}

	/** Reads with custom leading header. */
	async readWithCustomHeader(size: number): Promise<Uint8Array> {
		this.skipBytes = size
		await this.openFile()
		const buffer = await this.readCustomHeader()
		await this.readHeader()
		await this.readMSAT()
		await this.readSAT()
		await this.readSSAT()
		await this.readDirectoryTree()
		return buffer
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
	async readSector(secId: number, offset = 0, bytesToRead = 0): Promise<Uint8Array> {
		return this.readSectors([secId], offset, bytesToRead)
	}

	/** Reads sectors (coalesces contiguous runs for I/O efficiency). */
	async readSectors(secIds: number[], offset = 0, bytesToRead = 0): Promise<Uint8Array> {
		const secSize = this.header.secSize
		bytesToRead = Math.min(secIds.length * secSize, bytesToRead || secIds.length * secSize)
		this.assertLoaded()
		const browserData = (this.reader as unknown as { data?: Uint8Array }).data
		if (browserData)
			return this.copyFromBrowser(browserData, secIds, secSize, offset, bytesToRead, (id) =>
				this.getFileOffsetForSec(id),
			)

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
				if (this.getFileOffsetForSec(secIds[i + runLen - 1]) + secSize !== this.getFileOffsetForSec(secIds[i + runLen]))
					break
				const next = Math.min(secSize, remaining - runBytes)
				runBytes += next
				runLen++
				if (next < secSize) break
			}
			const fileOff = off + this.getFileOffsetForSec(secIds[i])
			const toRead = Math.min(runBytes, remaining)
			await this.reader.read(out, outOff, toRead, fileOff)
			outOff += toRead
			remaining -= toRead
			off = 0
			i += runLen
		}
		return out
	}

	/** Reads one short sector. */
	async readShortSector(secId: number, offset = 0, bytesToRead = 0): Promise<Uint8Array> {
		return this.readShortSectors([secId], offset, bytesToRead)
	}

	/** Reads short sectors. */
	async readShortSectors(secIds: number[], offset = 0, bytesToRead = 0): Promise<Uint8Array> {
		const secSize = this.header.shortSecSize
		bytesToRead = Math.min(secIds.length * secSize, bytesToRead || secIds.length * secSize)
		this.assertLoaded()
		const browserData = (this.reader as unknown as { data?: Uint8Array }).data
		if (browserData)
			return this.copyFromBrowser(browserData, secIds, secSize, offset, bytesToRead, (id) =>
				this.getFileOffsetForShortSec(id),
			)

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
				if (
					this.getFileOffsetForShortSec(secIds[i + runLen - 1]) + secSize !==
					this.getFileOffsetForShortSec(secIds[i + runLen])
				)
					break
				const next = Math.min(secSize, remaining - runBytes)
				runBytes += next
				runLen++
				if (next < secSize) break
			}
			const fileOff = off + this.getFileOffsetForShortSec(secIds[i])
			const toRead = Math.min(runBytes, remaining)
			await this.reader.read(out, outOff, toRead, fileOff)
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

	private copyFromBrowser(
		data: Uint8Array,
		ids: number[],
		secSize: number,
		offset: number,
		bytesToRead: number,
		getOff: (id: number) => number,
	): Uint8Array {
		const out = new Uint8Array(bytesToRead)
		let i = 0,
			outOff = 0,
			off = offset,
			remaining = bytesToRead
		while (i < ids.length && remaining > 0) {
			if (off >= secSize) {
				off -= secSize
				i++
				continue
			}
			const len = Math.min(secSize - off, remaining)
			const fileOff = off + getOff(ids[i])
			out.set(data.subarray(fileOff, fileOff + len), outOff)
			remaining -= len
			outOff += len
			off = 0
			i++
		}
		return out
	}

	private assertLoaded(): void {
		if (!this.reader.isOpen()) throw new Error('Document must be loaded first.')
	}

	private async openFile(): Promise<void> {
		await this.reader.open()
	}

	private async readCustomHeader(): Promise<Uint8Array> {
		const buf = new Uint8Array(this.skipBytes)
		const [n, data] = await this.reader.read(buf, 0, this.skipBytes, 0)
		return data.slice(0, n)
	}

	private async readHeader(): Promise<void> {
		const buf = new Uint8Array(512)
		const [n, data] = await this.reader.read(buf, 0, 512, this.skipBytes)
		this.header = Header.load(data.slice(0, n))
	}

	private async readMSAT(): Promise<void> {
		this.MSAT = this.header.partialMSAT.slice(0)
		this.MSAT.length = this.header.SATSize
		if (this.header.SATSize <= 109 || !this.header.MSATSize) return
		let secId = this.header.MSATSecId
		let idx = 109
		for (let i = 0; i < this.header.MSATSize; i++) {
			const sector = await this.readSector(secId)
			const view = getDataView(sector)
			for (let s = 0; s < this.header.secSize - 4; s += 4) {
				if (idx >= this.header.SATSize) break
				this.MSAT[idx++] = view.getInt32(s, true)
			}
			secId = view.getInt32(this.header.secSize - 4, true)
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
		return this.skipBytes + (secId + 1) * this.header.secSize
	}

	private getFileOffsetForShortSec(id: number): number {
		const shortSize = this.header.shortSecSize
		const off = id * shortSize
		const secSize = this.header.secSize
		const idx = Math.floor(off / secSize)
		const secId = this.shortStreamSecIds[idx]
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
}
