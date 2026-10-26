// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { ThreeHelper } from '../../../test/three.helper'
import { Player } from '../../game/player.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import type { ReadResult, Storage } from '../../io/ole-doc.js'
import { Enums } from '../enums.js'
import { Table } from '../table/table.js'
import { FlasherApi } from './flasher-api.js'
import { type FlasherAddBlend, FlasherData } from './flasher-data.js'
import { FlasherMeshGenerator } from './flasher-mesh-generator.js'

chai.use((sinonChai as any).default ?? sinonChai)
const three = new ThreeHelper()

describe('The VPinball flasher API', () => {
	let table: Table
	let _player: Player

	beforeEach(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-flasher.vpx')))
		_player = new Player(table).init()
	})

	it('should correctly read and write the properties', async () => {
		const flasher = table.flashers.Flasher.getApi()

		flasher.X = 304
		flasher.Y = 1.8
		flasher.RotX = 554.7
		flasher.RotY = 943
		flasher.RotZ = 275
		flasher.Height = 52
		flasher.Color = 0x55ff9a
		flasher.ImageA = 'ImageA'
		flasher.ImageB = 'ImageB'
		flasher.Filter = 'Additive'
		expect(flasher.Filter).to.equal('Additive')
		flasher.Filter = 'Multiply'
		expect(flasher.Filter).to.equal('Multiply')
		flasher.Filter = 'Screen'
		expect(flasher.Filter).to.equal('Screen')
		flasher.Filter = 'None'
		expect(flasher.Filter).to.equal('None')
		flasher.Filter = 'invalid-so-none'
		flasher.Opacity = -5
		expect(flasher.Opacity).to.equal(0)
		flasher.Opacity = 0.9
		flasher.IntensityScale = 1.5
		flasher.ModulateVsAdd = 0.8
		flasher.Amount = -1
		expect(flasher.Amount).to.equal(0)
		flasher.Amount = 5
		flasher.Visible = true
		expect(flasher.Visible).to.equal(true)
		flasher.Visible = false
		flasher.DisplayTexture = true
		expect(flasher.DisplayTexture).to.equal(true)
		flasher.DisplayTexture = false
		flasher.AddBlend = true
		expect(flasher.AddBlend).to.equal(true)
		flasher.AddBlend = false
		flasher.DMD = true
		expect(flasher.DMD).to.equal(true)
		flasher.DMD = false
		flasher.DepthBias = 2.6
		flasher.ImageAlignment = Enums.RampImageAlignment.ImageModeWrap
		expect(flasher.ImageAlignment).to.equal(Enums.RampImageAlignment.ImageModeWrap)
		flasher.ImageAlignment = Enums.RampImageAlignment.ImageModeWorld

		expect(flasher.X).to.be.closeTo(304, 0.0001)
		expect(flasher.Y).to.be.closeTo(1.8, 0.0001)
		expect(flasher.RotX).to.equal(554.7)
		expect(flasher.RotY).to.equal(943)
		expect(flasher.RotZ).to.equal(275)
		expect(flasher.Height).to.equal(52)
		expect(flasher.Color).to.equal(0x55ff9a)
		expect(flasher.RotY).to.equal(943)
		expect(flasher.ImageA).to.equal('ImageA')
		expect(flasher.ImageB).to.equal('ImageB')
		expect(flasher.Filter).to.equal('None')
		expect(flasher.Opacity).to.equal(0.9)
		expect(flasher.IntensityScale).to.equal(1.5)
		expect(flasher.ModulateVsAdd).to.equal(0.8)
		expect(flasher.Amount).to.equal(5)
		expect(flasher.Visible).to.equal(false)
		expect(flasher.DisplayTexture).to.equal(false)
		expect(flasher.AddBlend).to.equal(false)
		expect(flasher.DMD).to.equal(false)
		expect(flasher.DepthBias).to.equal(2.6)
		expect(flasher.ImageAlignment).to.equal(Enums.RampImageAlignment.ImageModeWorld)
	})

	it('should expose the 3-state blend mode with a legacy bool view', () => {
		const flasher = table.flashers.Flasher.getApi()
		flasher.AddBlendMode = 2
		expect(flasher.AddBlendMode).to.equal(2)
		expect(flasher.AddBlend).to.equal(true)
		flasher.AddBlend = false
		expect(flasher.AddBlendMode).to.equal(0)
		flasher.AddBlend = true
		expect(flasher.AddBlendMode).to.equal(1)
		flasher.AddBlendMode = 99 as FlasherAddBlend
		expect(flasher.AddBlendMode).to.equal(2)
		flasher.AddBlendMode = -5 as FlasherAddBlend
		expect(flasher.AddBlendMode).to.equal(0)
	})

	it('should round-trip Overlay and ignore unknown filter names like upstream', () => {
		const flasher = table.flashers.Flasher.getApi()
		expect(flasher.Filter).to.equal('Overlay')
		flasher.Filter = 'overlay'
		expect(flasher.Filter).to.equal('Overlay')
		flasher.Filter = 'Multiply'
		flasher.Filter = 'bogus-value'
		expect(flasher.Filter).to.equal('Multiply')
	})

	it('should report the drag-point outline center as X/Y', () => {
		const item = table.flashers.Flasher
		const flasher = item.getApi()
		const pointX = item.data.dragPoints.map(dragPoint => dragPoint.vertex.x)
		const pointY = item.data.dragPoints.map(dragPoint => dragPoint.vertex.y)
		expect(flasher.X).to.be.closeTo((Math.min(...pointX) + Math.max(...pointX)) / 2, 0.0001)
		expect(flasher.Y).to.be.closeTo((Math.min(...pointY) + Math.max(...pointY)) / 2, 0.0001)
	})

	it('should translate all drag points and the rendered mesh when setting X/Y', () => {
		const item = table.flashers.Flasher
		const flasher = item.getApi()
		const generator = new FlasherMeshGenerator()
		const beforePoints = item.data.dragPoints.map(dragPoint => ({ x: dragPoint.vertex.x, y: dragPoint.vertex.y }))
		const beforeMesh = generator
			.generateMesh(item.data, table)
			.vertices.map(vertex => ({ x: vertex.x, y: vertex.y }))

		const startX = flasher.X
		const startY = flasher.Y
		flasher.X = startX + 25
		flasher.Y = startY - 40

		expect(flasher.X).to.be.closeTo(startX + 25, 0.0001)
		expect(flasher.Y).to.be.closeTo(startY - 40, 0.0001)
		for (const [index, dragPoint] of item.data.dragPoints.entries()) {
			expect(dragPoint.vertex.x).to.be.closeTo(beforePoints[index].x + 25, 0.0001)
			expect(dragPoint.vertex.y).to.be.closeTo(beforePoints[index].y - 40, 0.0001)
		}
		const afterMesh = generator.generateMesh(item.data, table).vertices
		expect(afterMesh.length).to.equal(beforeMesh.length)
		for (const [index, vertex] of afterMesh.entries()) {
			expect(vertex.x).to.be.closeTo(beforeMesh[index].x + 25, 0.001)
			expect(vertex.y).to.be.closeTo(beforeMesh[index].y - 40, 0.001)
		}
	})
})

describe('The VPinball flasher ADDB tag', () => {
	async function loadWithAddb(value: number): Promise<FlasherData> {
		const record = new Uint8Array(20)
		const view = new DataView(record.buffer)
		view.setInt32(0, 8, true)
		record.set([0x41, 0x44, 0x44, 0x42], 4) // ADDB
		view.setInt32(8, value, true)
		view.setInt32(12, 4, true)
		record.set([0x45, 0x4e, 0x44, 0x42], 16) // ENDB
		const storage = {
			async streamFiltered(
				_name: string,
				_offset: number,
				next: (result: ReadResult) => Promise<number | null>,
			): Promise<void> {
				let pos = 0
				while (pos < record.length) {
					const consumed = await next({ data: record.subarray(pos), storageOffset: pos })
					if (consumed === null) break
					pos += consumed
				}
			},
		}
		return FlasherData.fromStorage(storage as unknown as Storage, 'Flasher')
	}

	function stringRecord(tag: string, value: string): Uint8Array {
		// Upstream WriteString layout: size = 8 + len, payload = [len:4][bytes].
		const bytes = new TextEncoder().encode(value)
		const record = new Uint8Array(12 + bytes.length)
		new DataView(record.buffer).setInt32(0, 8 + bytes.length, true)
		for (const [index, char] of [...tag].entries()) {
			record[4 + index] = char.charCodeAt(0)
		}
		new DataView(record.buffer).setInt32(8, bytes.length, true)
		record.set(bytes, 12)
		return record
	}

	function concatRecords(parts: Uint8Array[]): Uint8Array {
		const record = new Uint8Array(parts.reduce((size, part) => size + part.length, 0))
		let pos = 0
		for (const part of parts) {
			record.set(part, pos)
			pos += part.length
		}
		return record
	}

	async function loadWithRecords(record: Uint8Array): Promise<FlasherData> {
		const storage = {
			async streamFiltered(
				_name: string,
				_offset: number,
				next: (result: ReadResult) => Promise<number | null>,
			): Promise<void> {
				let pos = 0
				while (pos < record.length) {
					const consumed = await next({ data: record.subarray(pos), storageOffset: pos })
					if (consumed === null) break
					pos += consumed
				}
			},
		}
		return FlasherData.fromStorage(storage as unknown as Storage, 'Flasher')
	}

	it('should parse LMAP and SLNK tags like upstream', async () => {
		const endb = new Uint8Array(8)
		new DataView(endb.buffer).setInt32(0, 4, true)
		endb.set([0x45, 0x4e, 0x44, 0x42], 4) // ENDB
		const data = await loadWithRecords(
			concatRecords([stringRecord('LMAP', 'L1'), stringRecord('SLNK', 'dmd:score'), endb]),
		)
		expect(data.szLightmap).to.equal('L1')
		expect(data.stateSrcLink).to.equal('dmd:score')
	})

	it('should parse ADDB as a 3-state blend mode', async () => {
		expect((await loadWithAddb(0)).addBlendMode).to.equal(0)
		expect((await loadWithAddb(1)).addBlendMode).to.equal(1)
		expect((await loadWithAddb(2)).addBlendMode).to.equal(2)
		expect((await loadWithAddb(2)).addBlend).to.equal(true)
	})

	it('should clamp out-of-range ADDB values like upstream', async () => {
		expect((await loadWithAddb(99)).addBlendMode).to.equal(2)
		expect((await loadWithAddb(-5)).addBlendMode).to.equal(0)
	})

	it('should floor alpha and filter amount at zero without an upper bound', async () => {
		const flasher = new FlasherApi(new (FlasherData as any)('Flasher'), {} as any, {} as any, {} as any)
		flasher.Alpha = 150
		expect(flasher.Alpha).to.equal(150)
		flasher.Alpha = -5
		expect(flasher.Alpha).to.equal(0)
		flasher.FilterAmount = 200
		expect(flasher.FilterAmount).to.equal(200)
		flasher.FilterAmount = -3
		expect(flasher.FilterAmount).to.equal(0)
	})
})
