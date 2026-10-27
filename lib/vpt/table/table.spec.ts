// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import type { Mesh } from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { ThreeHelper } from '../../../test/three.helper'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import type { ReadResult, Storage } from '../../io/ole-doc.js'
import { Table } from './table.js'
import { TableData } from './table-data.js'
import { TableExporter } from './table-exporter.js'

const three = new ThreeHelper()

const tableWidth = 1111
const tableHeight = 2222
const tableDepth = 20

describe('The VPinball table generator', () => {
	let gltf: GLTF
	let table: Table

	before(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-empty.vpx')))
		const exporter = new TableExporter(table)
		gltf = await three.loadGlb(await exporter.exportGlb({ exportPlayfieldLights: false }))
	})

	it('should generate the correct playfield mesh', async () => {
		const playfieldMesh = three.first<Mesh>(gltf, 'playfield')
		const playfieldVertices = three.vertices(playfieldMesh)
		const expectedVertices = [
			0,
			0,
			-tableDepth,
			0,
			tableHeight,
			-tableDepth,
			tableWidth,
			tableHeight,
			-tableDepth,
			tableWidth,
			tableHeight,
			-tableDepth,
			tableWidth,
			0,
			-tableDepth,
			0,
			0,
			-tableDepth,
			tableWidth,
			tableHeight,
			0,
			0,
			tableHeight,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			tableWidth,
			0,
			0,
			tableWidth,
			tableHeight,
			0,
			0,
			0,
			-tableDepth,
			tableWidth,
			0,
			-tableDepth,
			0,
			0,
			0,
			tableWidth,
			0,
			-tableDepth,
			tableWidth,
			0,
			0,
			0,
			0,
			0,
			tableWidth,
			0,
			-tableDepth,
			tableWidth,
			tableHeight,
			-tableDepth,
			tableWidth,
			0,
			0,
			tableWidth,
			tableHeight,
			-tableDepth,
			tableWidth,
			tableHeight,
			0,
			tableWidth,
			0,
			0,
			tableWidth,
			tableHeight,
			-tableDepth,
			0,
			tableHeight,
			-tableDepth,
			tableWidth,
			tableHeight,
			0,
			0,
			tableHeight,
			-tableDepth,
			0,
			tableHeight,
			0,
			tableWidth,
			tableHeight,
			0,
			0,
			tableHeight,
			-tableDepth,
			0,
			0,
			-tableDepth,
			0,
			tableHeight,
			0,
			0,
			0,
			-tableDepth,
			0,
			0,
			0,
			0,
			tableHeight,
			0,
		]
		expect(Array.from(playfieldVertices)).to.deep.equal(expectedVertices)
	})

	it('should read the table script correctly', () => {
		const script = table.getTableScript()
		expect(script).to.equal(`Option Explicit\r\n`)
	})

	it('should read the table info correctly', async () => {
		expect(table.info?.TableRules).to.equal('Rules')
		expect(table.info?.AuthorName).to.equal('Table Author')
		expect(table.info?.TableName).to.equal('Table Name')
		expect(table.info?.TableBlurb).to.equal('Short Blurb')
		expect(table.info?.ReleaseDate).to.equal('2019-04-14')
		expect(table.info?.AuthorEmail).to.equal('test@vpdb.io')
		expect(table.info?.customdata1).to.equal('customvalue1')
		expect(table.info?.AuthorWebSite).to.equal('https://vpdb.io')
		expect(table.info?.TableVersion).to.equal('Version')
		expect(table.info?.TableDescription).to.equal('Description')
	})

	it('should not crash when reading a corrupt file', async () => {
		try {
			await Table.load(new NodeBinaryReader(three.fixturePath('table-corrupt.vpx')))
			expect.fail('Exception expected.')
		} catch (_err) {
			// expected
		}
	})
})

describe('TableData load fidelity regressions', () => {
	function record(tag: string, payload: Uint8Array): Uint8Array {
		// BIFF length prefix covers the 4 tag bytes plus the payload.
		const out = new Uint8Array(8 + payload.length)
		new DataView(out.buffer).setInt32(0, payload.length + 4, true)
		for (let i = 0; i < 4; i++) out[4 + i] = tag.charCodeAt(i)
		out.set(payload, 8)
		return out
	}

	function intRecord(tag: string, value: number): Uint8Array {
		const payload = new Uint8Array(4)
		new DataView(payload.buffer).setInt32(0, value, true)
		return record(tag, payload)
	}

	function storageOf(...records: Uint8Array[]): Storage {
		const total = records.reduce((n, r) => n + r.length, 0)
		const blob = new Uint8Array(total)
		let at = 0
		for (const r of records) {
			blob.set(r, at)
			at += r.length
		}
		return {
			async streamFiltered(
				_name: string,
				_offset: number,
				next: (result: ReadResult) => Promise<number | null>,
			): Promise<void> {
				let pos = 0
				while (pos < blob.length) {
					const consumed = await next({ data: blob.subarray(pos), storageOffset: pos })
					if (consumed === null || consumed <= 0) break
					pos += consumed
				}
			},
		} as unknown as Storage
	}

	it('should flag script-protected tables from SECB instead of decrypting', async () => {
		const flags = new Uint8Array(48)
		new DataView(flags.buffer).setUint32(32, 2, true)
		const locked = await TableData.fromStorage(storageOf(record('SECB', flags)), 'GameData')
		expect(locked.scriptProtected).to.equal(true)

		new DataView(flags.buffer).setUint32(32, 0, true)
		const open = await TableData.fromStorage(storageOf(record('SECB', flags)), 'GameData')
		expect(open.scriptProtected).to.equal(false)
	})

	it('should ignore CUST records (custom tags live in GameStg, not GameData)', async () => {
		const payload = new TextEncoder().encode('customdata1')
		const data = await TableData.fromStorage(storageOf(record('CUST', payload)), 'GameData')
		expect('szT' in data).to.equal(false)
		expect('vCustomInfoTag' in data).to.equal(false)
	})

	it('should drop case-insensitive duplicate materials keeping the last', async () => {
		const mate = new Uint8Array(2 * 76)
		mate.set(new TextEncoder().encode('Plastic'), 0)
		mate.set(new TextEncoder().encode('PLASTIC'), 76)
		const data = await TableData.fromStorage(storageOf(intRecord('MASI', 2), record('MATE', mate)), 'GameData')
		expect(data.materials.map(m => m.name)).to.deep.equal(['PLASTIC'])
	})

	it('should keep the signed PHML sentinel instead of mapping it to zero', async () => {
		const data = await TableData.fromStorage(storageOf(intRecord('PHML', -1)), 'GameData')
		expect(data.physicsMaxLoops).to.equal(-1)
	})

	it('should clamp TMAP to known tone mappers, defaulting to AGX', async () => {
		const clamped = await TableData.fromStorage(storageOf(intRecord('TMAP', 99)), 'GameData')
		expect(clamped.toneMapper).to.equal(1)
		const kept = await TableData.fromStorage(storageOf(intRecord('TMAP', 2)), 'GameData')
		expect(kept.toneMapper).to.equal(2)
	})

	it('should discard BTRA/BTST file values instead of storing them', async () => {
		const data = await TableData.fromStorage(storageOf(intRecord('BTRA', 1), intRecord('BTST', 1)), 'GameData')
		expect((data as unknown as Record<string, unknown>).ballTrailStrength).to.equal(undefined)
	})

	it('should prefill backglass view defaults without VSM tags', () => {
		const data = new TableData('GameData')
		expect(data.bgFov).to.deep.equal([45, 45, 45])
		expect(data.bgScaleX).to.deep.equal([1, 1, 1])
		expect(data.bgViewMode).to.deep.equal([0, 0, 0])
		expect(data.bgInclination).to.deep.equal([0.25, 0.25, 0.25])
	})
})
