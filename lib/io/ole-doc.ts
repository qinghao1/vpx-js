// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EventEmitter } from 'events'
import { concatUint8Arrays, getDataView } from './binary-helpers.js'
import { readableStream } from './event-stream.js'
import { Header } from './ole-header.js'

export { Header } from './ole-header.js'

import { AllocationTable } from './ole-allocation-table.js'

export { AllocationTable } from './ole-allocation-table.js'

import { DirectoryTree, type StorageEntry } from './ole-directory-tree.js'

export type { StorageEntry } from './ole-directory-tree.js'
export { DirectoryTree } from './ole-directory-tree.js'

import { Storage } from './ole-storage.js'

export { Storage } from './ole-storage.js'

/** OLE compound document. */
export class OleCompoundDoc extends EventEmitter {
	public header!: Header
	public SAT!: AllocationTable
	public SSAT!: AllocationTable

	private readonly reader: IBinaryReader
	private skipBytes: number
	private rootStorage!: Storage
	private MSAT: number[] = []
	private shortStreamSecIds: number[] = []
	private directoryTree: DirectoryTree | undefined

	private constructor(reader: IBinaryReader) {
		super()
		this.reader = reader
		this.skipBytes = 0
	}

	public static async load(reader: IBinaryReader): Promise<OleCompoundDoc> {
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

	public async readWithCustomHeader(size: number): Promise<Uint8Array> {
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

	public async reopen(): Promise<void> {
		await this.openFile()
	}

	public storage(storageName: string): Storage {
		this.assertLoaded()
		return this.rootStorage.storage(storageName)
	}

	public async readSector(secId: number, offset: number = 0, bytesToRead: number = 0): Promise<Uint8Array> {
		this.assertLoaded()
		return this.readSectors([secId], offset, bytesToRead)
	}

	public async readSectors(secIds: number[], offset: number = 0, bytesToRead: number = 0): Promise<Uint8Array> {
		bytesToRead = Math.min(secIds.length * this.header.secSize, bytesToRead || secIds.length * this.header.secSize)
		this.assertLoaded()
		const browserData = (this.reader as any).data as Uint8Array | undefined
		if (browserData) {
			const buffer = new Uint8Array(bytesToRead)
			let i = 0
			let bufferOffset = 0
			let off = offset
			let remaining = bytesToRead
			while (i < secIds.length && remaining > 0) {
				if (off >= this.header.secSize) {
					off -= this.header.secSize
					i++
					continue
				}
				const fileLen = Math.min(this.header.secSize - off, remaining)
				const fileOffset = off + this.getFileOffsetForSec(secIds[i])
				buffer.set(browserData.subarray(fileOffset, fileOffset + fileLen), bufferOffset)
				remaining -= fileLen
				bufferOffset += fileLen
				off = 0
				i++
			}
			return buffer
		}
		const buffer = new Uint8Array(bytesToRead)
		let i = 0
		let bufferOffset = 0
		let off = offset
		let remaining = bytesToRead
		while (i < secIds.length && remaining > 0) {
			if (off >= this.header.secSize) {
				off -= this.header.secSize
				i++
				continue
			}
			const fileLenFirst = Math.min(this.header.secSize - off, remaining)
			let runLen = 1
			let runBytes = fileLenFirst
			while (i + runLen < secIds.length && remaining - runBytes > 0) {
				const expected = this.getFileOffsetForSec(secIds[i + runLen - 1]) + this.header.secSize
				const actual = this.getFileOffsetForSec(secIds[i + runLen])
				if (expected !== actual) break
				const nextLen = Math.min(this.header.secSize, remaining - runBytes)
				runBytes += nextLen
				runLen++
				if (nextLen < this.header.secSize) break
			}
			const fileOffset = off + this.getFileOffsetForSec(secIds[i])
			const toRead = Math.min(runBytes, remaining)
			await this.reader.read(buffer, bufferOffset, toRead, fileOffset)
			bufferOffset += toRead
			remaining -= toRead
			off = 0
			i += runLen
		}
		return buffer
	}

	public async readShortSector(secId: number, offset: number = 0, bytesToRead: number = 0): Promise<Uint8Array> {
		this.assertLoaded()
		return this.readShortSectors([secId], offset, bytesToRead)
	}

	public async readShortSectors(secIds: number[], offset: number = 0, bytesToRead: number = 0): Promise<Uint8Array> {
		bytesToRead = Math.min(
			secIds.length * this.header.shortSecSize,
			bytesToRead || secIds.length * this.header.shortSecSize,
		)
		this.assertLoaded()
		const browserData = (this.reader as any).data as Uint8Array | undefined
		if (browserData) {
			const buffer = new Uint8Array(bytesToRead)
			let i = 0
			let bufferOffset = 0
			let off = offset
			let remaining = bytesToRead
			while (i < secIds.length && remaining > 0) {
				if (off >= this.header.shortSecSize) {
					off -= this.header.shortSecSize
					i++
					continue
				}
				const fileOffset = off + this.getFileOffsetForShortSec(secIds[i])
				const fileLen = Math.min(this.header.shortSecSize - off, remaining)
				buffer.set(browserData.subarray(fileOffset, fileOffset + fileLen), bufferOffset)
				remaining -= fileLen
				bufferOffset += fileLen
				off = 0
				i++
			}
			return buffer
		}
		const buffer = new Uint8Array(bytesToRead)
		let i = 0
		let bufferOffset = 0
		let off = offset
		let remaining = bytesToRead
		while (i < secIds.length && remaining > 0) {
			if (off >= this.header.shortSecSize) {
				off -= this.header.shortSecSize
				i++
				continue
			}
			const fileLenFirst = Math.min(this.header.shortSecSize - off, remaining)
			let runLen = 1
			let runBytes = fileLenFirst
			while (i + runLen < secIds.length && remaining - runBytes > 0) {
				const expected = this.getFileOffsetForShortSec(secIds[i + runLen - 1]) + this.header.shortSecSize
				const actual = this.getFileOffsetForShortSec(secIds[i + runLen])
				if (expected !== actual) break
				const nextLen = Math.min(this.header.shortSecSize, remaining - runBytes)
				runBytes += nextLen
				runLen++
				if (nextLen < this.header.shortSecSize) break
			}
			const fileOffset = off + this.getFileOffsetForShortSec(secIds[i])
			const toRead = Math.min(runBytes, remaining)
			await this.reader.read(buffer, bufferOffset, toRead, fileOffset)
			bufferOffset += toRead
			remaining -= toRead
			off = 0
			i += runLen
		}
		return buffer
	}

	public async close(): Promise<void> {
		await this.reader.close()
	}

	private assertLoaded() {
		/* istanbul ignore if */
		if (!this.reader.isOpen()) {
			throw new Error('Document must be loaded first.')
		}
	}

	private async openFile(): Promise<void> {
		await this.reader.open()
	}

	private async readCustomHeader(): Promise<Uint8Array> {
		const buffer = new Uint8Array(this.skipBytes)
		const [bytesRead, data] = await this.reader.read(buffer, 0, this.skipBytes, 0)
		// structuredClone to detach if needed, or just return data slice
		const result = (
			typeof structuredClone !== 'undefined'
				? structuredClone(data.subarray(0, bytesRead) as any)
				: data.slice(0, bytesRead)
		) as Uint8Array
		return result
	}

	private async readHeader(): Promise<void> {
		const buffer = new Uint8Array(512)
		const [bytesRead, data] = await this.reader.read(buffer, 0, 512, this.skipBytes)
		const slice = data.subarray(0, bytesRead)
		const copy = new Uint8Array(slice.length)
		copy.set(slice)
		this.header = Header.load(copy)
	}

	private async readMSAT(): Promise<void> {
		this.MSAT = this.header.partialMSAT.slice(0)
		this.MSAT.length = this.header.SATSize
		if (this.header.SATSize <= 109 || this.header.MSATSize === 0) {
			return
		}
		let secId = this.header.MSATSecId
		let currMSATIndex = 109
		let i = 0
		while (i < this.header.MSATSize) {
			const sectorBuffer = await this.readSector(secId)
			const view = getDataView(sectorBuffer)
			for (let s = 0; s < this.header.secSize - 4; s += 4) {
				if (currMSATIndex >= this.header.SATSize) {
					break
				} else {
					this.MSAT[currMSATIndex] = view.getInt32(s, true)
				}
				currMSATIndex++
			}
			secId = view.getInt32(this.header.secSize - 4, true)
			i++
		}
	}

	private async readSAT(): Promise<void> {
		this.SAT = await AllocationTable.load(this, this.MSAT)
	}

	private async readSSAT(): Promise<void> {
		const secIds = this.SAT.getSecIdChain(this.header.SSATSecId)
		/* istanbul ignore if */
		if (secIds.length !== this.header.SSATSize) {
			throw new Error('Invalid Short Sector Allocation Table')
		}
		this.SSAT = await AllocationTable.load(this, secIds)
	}

	private async readDirectoryTree(): Promise<void> {
		const secIds = this.SAT.getSecIdChain(this.header.dirSecId)
		this.directoryTree = await DirectoryTree.load(this, secIds)
		const rootEntry = this.directoryTree.root
		this.rootStorage = new Storage(this, rootEntry)
		this.shortStreamSecIds = this.SAT.getSecIdChain(rootEntry.secId)
	}

	private getFileOffsetForSec(secId: number): number {
		const secSize = this.header.secSize
		return this.skipBytes + (secId + 1) * secSize
	}

	private getFileOffsetForShortSec(shortSecId: number): number {
		const shortSecSize = this.header.shortSecSize
		const shortStreamOffset = shortSecId * shortSecSize
		const secSize = this.header.secSize
		const secIdIndex = Math.floor(shortStreamOffset / secSize)
		const secOffset = shortStreamOffset % secSize
		const secId = this.shortStreamSecIds[secIdIndex]
		return this.getFileOffsetForSec(secId) + secOffset
	}
}

export interface ReadResult {
	data: Uint8Array
	storageOffset: number
}

export interface IBinaryReader {
	read(target: Uint8Array, offset: number, length: number, position: number): Promise<[number, Uint8Array]>
	open(): Promise<void>
	close(): Promise<void>
	isOpen(): boolean
}
