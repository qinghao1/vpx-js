// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { ThreeHelper } from '../../../test/three.helper'
import { Player } from '../../game/player.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import type { ReadResult, Storage } from '../../io/ole-doc.js'
import { Table } from '../table/table.js'
import { BumperData } from './bumper.js'

chai.use((sinonChai as any).default ?? sinonChai)
const three = new ThreeHelper()

describe('The VPinball bumper API', () => {
	let table: Table
	let player: Player

	beforeEach(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-bumper.vpx')))
		player = new Player(table).init()
	})

	it('should correctly read and write the properties', async () => {
		const bumper = table.bumpers.Bumper3.getApi()

		bumper.Radius = 22.5
		expect(bumper.Radius).to.equal(22.5)
		bumper.Force = 1.23
		expect(bumper.Force).to.equal(1.23)
		bumper.Scatter = 98238
		expect(bumper.Scatter).to.equal(98238)
		bumper.HeightScale = 2
		expect(bumper.HeightScale).to.equal(2)
		bumper.RingSpeed = 122
		expect(bumper.RingSpeed).to.equal(122)
		bumper.RingDropOffset = -5
		expect(bumper.RingDropOffset).to.equal(-5)
		bumper.Orientation = 270
		expect(bumper.Orientation).to.equal(270)
		bumper.Threshold = 0.115
		expect(bumper.Threshold).to.equal(0.115)
		bumper.CapMaterial = 'CapMaterial'
		expect(bumper.CapMaterial).to.equal('CapMaterial')
		bumper.RingMaterial = 'RingMaterial'
		expect(bumper.RingMaterial).to.equal('RingMaterial')
		bumper.BaseMaterial = 'BaseMaterial'
		expect(bumper.BaseMaterial).to.equal('BaseMaterial')
		bumper.SkirtMaterial = 'SkirtMaterial'
		expect(bumper.SkirtMaterial).to.equal('SkirtMaterial')
		bumper.X = 5586
		expect(bumper.X).to.equal(5586)
		bumper.Y = 15547
		expect(bumper.Y).to.equal(15547)
		bumper.Surface = 'Surface'
		expect(bumper.Surface).to.equal('Surface')
		bumper.HasHitEvent = false
		expect(bumper.HasHitEvent).to.equal(false)
		bumper.HasHitEvent = true
		expect(bumper.HasHitEvent).to.equal(true)
		bumper.Collidable = false
		expect(bumper.Collidable).to.equal(false)
		bumper.Collidable = true
		expect(bumper.Collidable).to.equal(true)
		bumper.CapVisible = false
		expect(bumper.CapVisible).to.equal(false)
		bumper.CapVisible = true
		expect(bumper.CapVisible).to.equal(true)
		bumper.BaseVisible = false
		expect(bumper.BaseVisible).to.equal(false)
		bumper.BaseVisible = true
		expect(bumper.BaseVisible).to.equal(true)
		bumper.RingVisible = false
		expect(bumper.RingVisible).to.equal(false)
		bumper.RingVisible = true
		expect(bumper.RingVisible).to.equal(true)
		bumper.SkirtVisible = false
		expect(bumper.SkirtVisible).to.equal(false)
		bumper.SkirtVisible = true
		expect(bumper.SkirtVisible).to.equal(true)
		bumper.ReflectionEnabled = false
		expect(bumper.ReflectionEnabled).to.equal(false)
		bumper.ReflectionEnabled = true
		expect(bumper.ReflectionEnabled).to.equal(true)
		bumper.EnableSkirtAnimation = false
		expect(bumper.EnableSkirtAnimation).to.equal(false)
		bumper.EnableSkirtAnimation = true
		expect(bumper.EnableSkirtAnimation).to.equal(true)
	})

	it('should animate the bumper', () => {
		const bumper = table.bumpers.Bumper1

		bumper.getApi().PlayHit()

		player.simulateTime(10)
		expect(bumper.getState().ringOffset).to.equal(0)

		player.simulateTime(20)
		expect(bumper.getState().ringOffset).to.be.closeTo(-8.33, 0.01)
	})

	it('should animate the bumper even when the ring is invisible', () => {
		const bumper = table.bumpers.Bumper1

		bumper.getApi().RingVisible = false
		bumper.getApi().PlayHit()

		player.simulateTime(10)
		expect(bumper.getState().ringOffset).to.equal(0)

		player.simulateTime(20)
		expect(bumper.getState().ringOffset).to.be.closeTo(-8.33, 0.01)
	})

	it('should expose the shared ItemApi contract', () => {
		// Single contract test for ItemApi.InterfaceSupportsErrorInfo — the shared
		// base implementation applies to every item API, so no per-item copies.
		const bumper = table.bumpers.Bumper1.getApi()
		expect(bumper.InterfaceSupportsErrorInfo({})).to.equal(false)
	})
})

describe('The legacy bumper visibility tags', () => {
	async function loadWithTag(tag: string, value: number): Promise<BumperData> {
		const record = new Uint8Array(20)
		const view = new DataView(record.buffer)
		view.setInt32(0, 8, true)
		for (let i = 0; i < 4; i++) record[4 + i] = tag.charCodeAt(i)
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
		return BumperData.fromStorage(storage as unknown as Storage, 'Bumper')
	}

	it('should apply BVIS to all four visibilities like upstream', async () => {
		const data = await loadWithTag('BVIS', 0)
		expect(data.isCapVisible).to.equal(false)
		expect(data.isBaseVisible).to.equal(false)
		expect(data.isRingVisible).to.equal(false)
		expect(data.isSkirtVisible).to.equal(false)
	})

	it('should apply BSVS to base, ring and skirt but not the cap', async () => {
		const data = await loadWithTag('BSVS', 0)
		expect(data.isCapVisible).to.equal(true)
		expect(data.isBaseVisible).to.equal(false)
		expect(data.isRingVisible).to.equal(false)
		expect(data.isSkirtVisible).to.equal(false)
	})
})
