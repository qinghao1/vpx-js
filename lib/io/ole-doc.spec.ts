import { readFile } from 'node:fs/promises'
import { expect } from 'chai'
import { OLE_ID } from './binary-helpers.js'
import { BinaryReader } from './binary-reader.js'
import { AllocationTable } from './ole-allocation-table.js'
import { DirectoryTree } from './ole-directory-tree.js'
import { type IBinaryReader, OleCompoundDoc } from './ole-doc.js'
import { Header } from './ole-header.js'

interface HeaderOverrides {
	secShift?: number
	shortShift?: number
	satSize?: number
	dirSecId?: number
	ssatSecId?: number
	ssatSize?: number
	msatSecId?: number
	msatSize?: number
	partialFirst?: number
}

function buildHeader(overrides: HeaderOverrides = {}): Uint8Array {
	const header = new Uint8Array(512)
	header.set(OLE_ID, 0)
	const view = new DataView(header.buffer)
	view.setUint16(30, overrides.secShift ?? 9, true)
	view.setUint16(32, overrides.shortShift ?? 6, true)
	view.setInt32(44, overrides.satSize ?? 1, true)
	view.setInt32(48, overrides.dirSecId ?? 1, true)
	view.setInt32(56, 4096, true)
	view.setInt32(60, overrides.ssatSecId ?? -2, true)
	view.setInt32(64, overrides.ssatSize ?? 0, true)
	view.setInt32(68, overrides.msatSecId ?? -2, true)
	view.setInt32(72, overrides.msatSize ?? 0, true)
	for (let entryIndex = 0; entryIndex < 109; entryIndex++) {
		view.setInt32(76 + entryIndex * 4, entryIndex === 0 ? (overrides.partialFirst ?? 0) : -1, true)
	}
	return header
}

function buildDirEntry(type: number, left: number, right: number, storageDirId: number): Uint8Array {
	const entry = new Uint8Array(128)
	const view = new DataView(entry.buffer)
	view.setInt16(64, 2, true)
	view.setInt8(66, type)
	view.setInt32(68, left, true)
	view.setInt32(72, right, true)
	view.setInt32(76, storageDirId, true)
	view.setInt32(116, -2, true)
	return entry
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
	let offset = 0
	for (const part of parts) {
		out.set(part, offset)
		offset += part.length
	}
	return out
}

function endlessTable(): Uint8Array {
	const bytes = new Uint8Array(512)
	const view = new DataView(bytes.buffer)
	for (let entryIndex = 0; entryIndex < 128; entryIndex++) {
		view.setInt32(entryIndex * 4, -2, true)
	}
	return bytes
}

/** In-memory reader that rejects impossible positions and short-reads past EOF. */
class MemoryReader implements IBinaryReader {
	private openFlag = false
	constructor(private readonly fileData: Uint8Array) {}
	async open(): Promise<void> {
		this.openFlag = true
	}
	async close(): Promise<void> {
		this.openFlag = false
	}
	isOpen(): boolean {
		return this.openFlag
	}
	async read(target: Uint8Array, offset: number, length: number, position: number): Promise<[number, Uint8Array]> {
		if (!Number.isInteger(position) || position < 0) throw new Error(`Invalid read position ${position}.`)
		const available = Math.max(0, Math.min(length, this.fileData.length - position))
		target.set(this.fileData.subarray(position, position + available), offset)
		return [available, target]
	}
}

/** Asserts that a promise rejects with a matching message. */
async function expectRejection(promise: Promise<unknown>, pattern: RegExp): Promise<void> {
	try {
		await promise
	} catch (error) {
		expect((error as Error).message).to.match(pattern)
		return
	}
	expect.fail('Expected promise to reject.')
}

/** Minimal valid compound file: header + SAT sector + directory sector with a root entry. */
function buildValidFile(): Uint8Array {
	const rootEntry = buildDirEntry(5, -1, -1, -1)
	const padding = new Uint8Array(512 - 128)
	return concatBytes(buildHeader(), endlessTable(), rootEntry, padding)
}

describe('The OLE compound document reader', () => {
	it('rejects a truncated header', () => {
		const short = buildHeader().subarray(0, 100)
		expect(() => Header.load(short)).to.throw(/truncated/)
	})

	it('rejects a bad OLE magic ID', () => {
		const badMagic = buildHeader()
		badMagic[0] ^= 0xff
		expect(() => Header.load(badMagic)).to.throw(/bad OLE ID/)
	})

	it('rejects an invalid sector size shift', () => {
		expect(() => Header.load(buildHeader({ secShift: 8 }))).to.throw(/sector/i)
	})

	it('rejects an invalid mini sector size shift', () => {
		expect(() => Header.load(buildHeader({ shortShift: 7 }))).to.throw(/mini|short/i)
	})

	it('rejects negative allocation table sizes', () => {
		expect(() => Header.load(buildHeader({ satSize: -5 }))).to.throw(/size|negative|corrupt/i)
	})

	it('fails fast on cyclic allocation chains', async () => {
		const bytes = new Uint8Array(16)
		const view = new DataView(bytes.buffer)
		view.setInt32(0, 0, true)
		for (let entryIndex = 1; entryIndex < 4; entryIndex++) {
			view.setInt32(entryIndex * 4, -2, true)
		}
		const fakeDoc = { readSectors: async () => bytes } as unknown as OleCompoundDoc
		const table = await AllocationTable.load(fakeDoc, [0])
		expect(() => table.getSecIdChain(0)).to.throw(/cycle/)
	})

	it('fails fast on cyclic directory siblings', async () => {
		const buf = concatBytes(buildDirEntry(5, -1, -1, 1), buildDirEntry(2, 2, -1, -1), buildDirEntry(2, 1, -1, -1))
		const fakeDoc = { readSectors: async () => buf } as unknown as OleCompoundDoc
		await expectRejection(DirectoryTree.load(fakeDoc, [0]), /cycle/)
	})

	it('rejects out-of-range directory child indexes', async () => {
		const buf = concatBytes(buildDirEntry(5, -1, -1, 1), buildDirEntry(2, 99, -1, -1))
		const fakeDoc = { readSectors: async () => buf } as unknown as OleCompoundDoc
		await expectRejection(DirectoryTree.load(fakeDoc, [0]), /range|invalid|corrupt/i)
	})

	it('fails fast on cyclic storage hierarchies', async () => {
		const buf = concatBytes(buildDirEntry(5, -1, -1, 1), buildDirEntry(1, -1, -1, 2), buildDirEntry(1, -1, -1, 1))
		const fakeDoc = { readSectors: async () => buf } as unknown as OleCompoundDoc
		await expectRejection(DirectoryTree.load(fakeDoc, [0]), /cycle/)
	})

	it('rejects MSAT holes', async () => {
		const fileData = concatBytes(buildHeader({ satSize: 200, msatSize: 0 }), endlessTable())
		await expectRejection(OleCompoundDoc.load(new MemoryReader(fileData)), /MSAT/)
	})

	it('rejects invalid DIFAT sector ids', async () => {
		const fileData = concatBytes(buildHeader({ satSize: 200, msatSize: 1, msatSecId: -5 }), endlessTable())
		await expectRejection(OleCompoundDoc.load(new MemoryReader(fileData)), /DIFAT/)
	})

	it('rejects cyclic DIFAT chains', async () => {
		const firstLink = new Uint8Array(512)
		new DataView(firstLink.buffer).setInt32(508, 3, true)
		const secondLink = new Uint8Array(512)
		new DataView(secondLink.buffer).setInt32(508, 2, true)
		const rootEntry = buildDirEntry(5, -1, -1, -1)
		const fileData = concatBytes(
			buildHeader({ satSize: 200, msatSize: 3, msatSecId: 2 }),
			endlessTable(),
			rootEntry,
			new Uint8Array(512 - 128),
			firstLink,
			secondLink,
		)
		await expectRejection(OleCompoundDoc.load(new MemoryReader(fileData)), /cycle/i)
	})

	it('rejects MSAT entries that are not real sectors', async () => {
		const fileData = concatBytes(buildHeader({ satSize: 1, partialFirst: -1 }), endlessTable())
		await expectRejection(OleCompoundDoc.load(new MemoryReader(fileData)), /MSAT/)
	})

	it('loads a minimal valid document', async () => {
		const doc = await OleCompoundDoc.load(new MemoryReader(buildValidFile()))
		expect(doc.header.secSize).to.equal(512)
		await doc.close()
	})
})

/** In-memory reader with the same single-subarray-copy contract as BinaryReader. */
class SubarrayMemoryReader implements IBinaryReader {
	private opened = false
	constructor(private readonly data: Uint8Array) {}

	public async open(): Promise<void> {
		this.opened = true
	}

	public async close(): Promise<void> {
		this.opened = false
	}

	public isOpen(): boolean {
		return this.opened
	}

	public async read(
		target: Uint8Array,
		offset: number,
		length: number,
		position: number,
	): Promise<[number, Uint8Array]> {
		if (!this.opened) throw new Error('MemoryReader not open')
		const slice = this.data.subarray(position, position + length)
		target.set(slice, offset)
		return [slice.length, target.subarray(offset, offset + slice.length)]
	}
}

const FIXTURE = 'test/fixtures/table-empty.vpx'

describe('The OLE compound document against real files', () => {
	it('should decode sector shifts as powers of two', () => {
		const buf = new Uint8Array(512)
		buf.set(OLE_ID, 0)
		const view = new DataView(buf.buffer)
		view.setUint16(30, 9, true)
		view.setUint16(32, 6, true)
		const header = Header.load(buf)
		expect(header.secSize).to.equal(512) // 2^9
		expect(header.shortSecSize).to.equal(64) // 2^6
	})

	it('should load a real VPX file and expose its storages', async () => {
		const bytes = new Uint8Array(await readFile(FIXTURE))
		const doc = await OleCompoundDoc.load(new BinaryReader(bytes))
		try {
			expect(doc.header.secSize).to.equal(4096) // 2^12
			expect(doc.header.shortSecSize).to.equal(64) // 2^6
			expect(doc.header.shortStreamMax).to.equal(4096)
			expect(doc.storage('GameStg').getStreams()).to.include('GameData')
			expect(doc.storage('TableInfo').getStreams()).to.include('TableName')
			const name = await doc.storage('TableInfo').read('TableName')
			expect(name.length).to.be.greaterThan(0)
		} finally {
			await doc.close()
		}
	})

	it('should read identical bytes through a subarray-copy reader', async () => {
		const bytes = new Uint8Array(await readFile(FIXTURE))
		const viaBinary = await OleCompoundDoc.load(new BinaryReader(bytes))
		const viaMemory = await OleCompoundDoc.load(new SubarrayMemoryReader(bytes))
		try {
			const a = await viaBinary.storage('TableInfo').read('TableName')
			const b = await viaMemory.storage('TableInfo').read('TableName')
			expect(new Uint8Array(b)).to.deep.equal(new Uint8Array(a))
			const sectorA = await viaBinary.readSector(0)
			const sectorB = await viaMemory.readSector(0)
			expect(new Uint8Array(sectorB)).to.deep.equal(new Uint8Array(sectorA))
		} finally {
			await viaBinary.close()
			await viaMemory.close()
		}
	})
})
