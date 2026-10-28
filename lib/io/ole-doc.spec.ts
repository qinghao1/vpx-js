import { readFile } from 'node:fs/promises'
import { expect } from 'chai'
import { BiffParser } from './biff-parser.js'
import { OLE_ID } from './binary-helpers.js'
import { BinaryReader } from './binary-reader.js'
import { AllocationTable } from './ole-allocation-table.js'
import { DirectoryTree, type StorageEntry } from './ole-directory-tree.js'
import { type IBinaryReader, OleCompoundDoc } from './ole-doc.js'
import { Header } from './ole-header.js'
import { Storage } from './ole-storage.js'

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

function buildNamedDirEntry(
	name: string,
	type: number,
	child: number,
	secId: number,
	size: number,
	left = -1,
	right = -1,
): Uint8Array {
	const entry = new Uint8Array(128)
	const view = new DataView(entry.buffer)
	for (let i = 0; i < name.length; i++) {
		view.setUint16(i * 2, name.charCodeAt(i), true)
	}
	view.setUint16(64, (name.length + 1) * 2, true)
	view.setInt8(66, type)
	view.setInt32(68, left, true)
	view.setInt32(72, right, true)
	view.setInt32(76, child, true)
	view.setInt32(116, secId, true)
	view.setUint32(120, size, true)
	return entry
}

/** Short stream 'T' (640 bytes = 10 mini-sectors) in storage 'S', but the root
 * short-stream container holds a single sector (8 mini-sectors). */
function buildShortStreamOverrunFile(): Uint8Array {
	const sat = new Uint8Array(512).fill(0xff)
	const satView = new DataView(sat.buffer)
	satView.setInt32(0, -3, true)
	for (const secId of [1, 2, 3]) satView.setInt32(secId * 4, -2, true)
	const dir = concatBytes(
		buildNamedDirEntry('', 5, 1, 3, 512),
		buildNamedDirEntry('S', 1, 2, -2, 0),
		buildNamedDirEntry('T', 2, -1, 0, 640),
		new Uint8Array(128),
	)
	const ssat = new Uint8Array(512).fill(0xff)
	const ssatView = new DataView(ssat.buffer)
	for (let i = 0; i < 9; i++) ssatView.setInt32(i * 4, i + 1, true)
	ssatView.setInt32(9 * 4, -2, true)
	return concatBytes(
		buildHeader({ satSize: 1, dirSecId: 1, ssatSecId: 2, ssatSize: 1, partialFirst: 0 }),
		sat,
		dir,
		ssat,
		new Uint8Array(512).fill(0xab),
	)
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

/**
 * Single in-memory reader fake: rejects impossible positions, short-reads
 * past EOF, and returns the same single-subarray-copy view BinaryReader does.
 */
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
		const slice = this.fileData.subarray(position, position + length)
		target.set(slice, offset)
		return [slice.length, target.subarray(offset, offset + slice.length)]
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

	it('rejects a zero SAT size like pole', () => {
		expect(() => Header.load(buildHeader({ satSize: 0 }))).to.throw(/size|corrupt|invalid/i)
	})

	it('names invalid sentinel links instead of reporting them missing', async () => {
		const tableWith = async (first: number): Promise<AllocationTable> => {
			const bytes = new Uint8Array(16)
			const view = new DataView(bytes.buffer)
			view.setInt32(0, first, true)
			for (let entryIndex = 1; entryIndex < 4; entryIndex++) {
				view.setInt32(entryIndex * 4, -2, true)
			}
			const fakeDoc = { readSectors: async () => bytes } as unknown as OleCompoundDoc
			return AllocationTable.load(fakeDoc, [0])
		}
		for (const sentinel of [-1, -3, -4]) {
			const table = await tableWith(sentinel)
			expect(() => table.getSecIdChain(0)).to.throw(new RegExp(`invalid secId ${sentinel}`))
		}
	})

	it('names an out-of-range start sector instead of reporting it missing', async () => {
		const table = await AllocationTable.load(
			{ readSectors: async () => endlessTable() } as unknown as OleCompoundDoc,
			[0],
		)
		expect(() => table.getSecIdChain(999)).to.throw(/invalid secId 999/)
	})

	it('treats EndOfChain as an empty chain', async () => {
		const table = await AllocationTable.load(
			{ readSectors: async () => endlessTable() } as unknown as OleCompoundDoc,
			[0],
		)
		expect(table.getSecIdChain(-2)).to.deep.equal([])
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

	it('keeps last-wins resolution for duplicate sibling names', async () => {
		// BST: root -> A; A.left = B('Dup', secId 10), A.right = C('Dup', secId 20).
		// Pre-order visit [A, B, C] assigns B then C, so the right sibling wins.
		const buf = concatBytes(
			buildNamedDirEntry('Root', 5, 1, -2, 0),
			buildNamedDirEntry('A', 2, -1, -2, 0, 2, 3),
			buildNamedDirEntry('Dup', 2, -1, 10, 0),
			buildNamedDirEntry('Dup', 2, -1, 20, 0),
		)
		const fakeDoc = { readSectors: async () => buf } as unknown as OleCompoundDoc
		const tree = await DirectoryTree.load(fakeDoc, [0])
		expect(tree.root.streams.Dup?.secId).to.equal(20)
	})

	it('resolves nested storages without re-walking drained frames', async () => {
		const buf = concatBytes(
			buildNamedDirEntry('Root', 5, 1, -2, 0),
			buildNamedDirEntry('GameStg', 1, 2, -2, 0),
			buildNamedDirEntry('GameData', 2, -1, -2, 0),
		)
		const fakeDoc = { readSectors: async () => buf } as unknown as OleCompoundDoc
		const tree = await DirectoryTree.load(fakeDoc, [0])
		const gameStg = tree.root.storages.GameStg
		expect(gameStg).to.not.equal(undefined)
		if (gameStg) expect(Object.keys(gameStg.streams)).to.deep.equal(['GameData'])
		expect(Object.keys(tree.root.streams)).to.deep.equal([])
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

	it('rejects a short stream that overruns its short-stream container', async () => {
		for (const reader of [
			new BinaryReader(buildShortStreamOverrunFile()),
			new MemoryReader(buildShortStreamOverrunFile()),
		]) {
			const doc = await OleCompoundDoc.load(reader)
			try {
				await expectRejection(doc.storage('S').read('T'), /Corrupt/)
			} finally {
				await doc.close()
			}
		}
	})

	it('loads a minimal valid document', async () => {
		const doc = await OleCompoundDoc.load(new MemoryReader(buildValidFile()))
		expect(doc.header.secSize).to.equal(512)
		await doc.close()
	})

	it('rejects reads after close when the reader retains no bytes', async () => {
		const doc = await OleCompoundDoc.load(new MemoryReader(buildValidFile()))
		await doc.close()
		await expectRejection(doc.readSector(0), /closed/i)
	})

	it('keeps serving reads after close when the reader retains its bytes', async () => {
		const doc = await OleCompoundDoc.load(new BinaryReader(buildValidFile()))
		const before = await doc.readSector(0)
		await doc.close()
		const after = await doc.readSector(0)
		expect(Array.from(after)).to.deep.equal(Array.from(before))
	})

	it('serves reads again after reopen', async () => {
		const doc = await OleCompoundDoc.load(new MemoryReader(buildValidFile()))
		await doc.close()
		await doc.reopen()
		expect((await doc.readSector(0)).length).to.equal(512)
	})

	it('rejects a streamed CODE record that overruns its stream', async () => {
		// CODE header claims len=4 with cchar=1000, but only 10 payload bytes follow.
		const cchar = new Uint8Array(4)
		new DataView(cchar.buffer).setInt32(0, 1000, true)
		const codeHead = new Uint8Array(8)
		new DataView(codeHead.buffer).setInt32(0, 4, true)
		for (let i = 0; i < 4; i++) codeHead[4 + i] = 'CODE'.charCodeAt(i)
		const stream = concatBytes(codeHead, cchar, new Uint8Array(10).fill(0x41))
		const doc = {
			header: { shortStreamMax: 4096, secSize: 512, shortSecSize: 64 },
			SAT: { getSecIdChain: () => [0] },
			SSAT: { getSecIdChain: () => [0] },
			readSectors: async () => stream,
			readShortSectors: async () => stream,
		} as unknown as OleCompoundDoc
		const streamEntry = (name: string, size: number): StorageEntry => ({
			name,
			type: 2,
			nodeColor: 0,
			left: -1,
			right: -1,
			storageDirId: -1,
			secId: 0,
			size,
			storages: {},
			streams: {},
		})
		const dirEntry: StorageEntry = {
			...streamEntry('', 0),
			type: 5,
			storages: {},
			streams: { GameData: streamEntry('GameData', stream.length) },
		}
		const storage = new Storage(doc, dirEntry)
		await expectRejection(
			storage.streamFiltered(
				'GameData',
				0,
				BiffParser.stream(async () => 0, { streamedTags: ['CODE'] }),
			),
			/past end of stream/,
		)
	})

	it('walks a deep sibling chain without recursing', async () => {
		const count = 20000
		const buf = new Uint8Array(count * 128)
		const view = new DataView(buf.buffer)
		const setEntry = (index: number, type: number, left: number, child: number): void => {
			const off = index * 128
			const name = `s${index}`
			for (let k = 0; k < name.length; k++) view.setUint16(off + k * 2, name.charCodeAt(k), true)
			view.setUint16(off + 64, (name.length + 1) * 2, true)
			view.setInt8(off + 66, type)
			view.setInt32(off + 68, left, true)
			view.setInt32(off + 72, -1, true)
			view.setInt32(off + 76, child, true)
			view.setInt32(off + 116, -2, true)
		}
		setEntry(0, 5, -1, 1)
		for (let i = 1; i < count - 1; i++) setEntry(i, 2, i + 1, -1)
		setEntry(count - 1, 2, -1, -1)
		const fakeDoc = { readSectors: async () => buf } as unknown as OleCompoundDoc
		const tree = await DirectoryTree.load(fakeDoc, [0])
		expect(Object.keys(tree.root.streams).length).to.equal(count - 1)
	})

	it('builds a deep storage hierarchy without recursing', async () => {
		const count = 20000
		const buf = new Uint8Array(count * 128)
		const view = new DataView(buf.buffer)
		const setEntry = (index: number, type: number, child: number): void => {
			const off = index * 128
			const name = `s${index}`
			for (let k = 0; k < name.length; k++) view.setUint16(off + k * 2, name.charCodeAt(k), true)
			view.setUint16(off + 64, (name.length + 1) * 2, true)
			view.setInt8(off + 66, type)
			view.setInt32(off + 68, -1, true)
			view.setInt32(off + 72, -1, true)
			view.setInt32(off + 76, child, true)
			view.setInt32(off + 116, -2, true)
		}
		setEntry(0, 5, 1)
		for (let i = 1; i < count - 1; i++) setEntry(i, 1, i + 1)
		setEntry(count - 1, 1, -1)
		const fakeDoc = { readSectors: async () => buf } as unknown as OleCompoundDoc
		const tree = await DirectoryTree.load(fakeDoc, [0])
		let entry = tree.root
		let depth = 0
		while (Object.keys(entry.storages).length > 0) {
			entry = Object.values(entry.storages)[0]!
			depth++
		}
		expect(depth).to.equal(count - 1)
	})
})

const FIXTURE = 'test/fixtures/table-empty.vpx'

describe('The OLE compound document against real files', () => {
	it('should decode sector shifts as powers of two', () => {
		const buf = new Uint8Array(512)
		buf.set(OLE_ID, 0)
		const view = new DataView(buf.buffer)
		view.setUint16(30, 9, true)
		view.setUint16(32, 6, true)
		view.setInt32(44, 1, true)
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
		const viaMemory = await OleCompoundDoc.load(new MemoryReader(bytes))
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
