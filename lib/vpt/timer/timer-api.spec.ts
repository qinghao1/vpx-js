// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import * as sinon from 'sinon'
import sinonChai from 'sinon-chai'
import { ThreeHelper } from '../../../test/three.helper'
import { Player } from '../../game/player.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import type { ReadResult, Storage } from '../../io/ole-doc.js'
import { TimerDataRoot } from '../item-data.js'
import { Table } from '../table/table.js'
import { TimerData } from './timer.js'

chai.use((sinonChai as any).default ?? sinonChai)
const three = new ThreeHelper()

describe('The VPinball timer API', () => {
	let table: Table
	let player: Player

	beforeEach(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-timer.vpx')))
		player = new Player(table).init()
	})

	it('should correctly read and write the properties', async () => {
		const timer = table.timers.Timer1.getApi()

		timer.Name = 'timername'
		expect(timer.Name).to.equal('timername')
		timer.Interval = 99
		expect(timer.Interval).to.equal(99)
		timer.Enabled = false
		expect(timer.Enabled).to.equal(false)
		timer.Enabled = true
		expect(timer.Enabled).to.equal(true)
		timer.UserValue = '1'
		expect(timer.UserValue).to.equal('1')
		timer.X = 2345
		expect(timer.X).to.equal(2345)
		timer.Y = 6354
		expect(timer.Y).to.equal(6354)
	})

	it('should execute the timer until disabled', async () => {
		const timer = table.timers.Timer1.getApi()

		timer.Enabled = true
		timer.Interval = 150
		const eventSpy = sinon.spy()
		timer.on('Timer', eventSpy)

		player.updatePhysics(120)
		expect(eventSpy).to.have.been.not.called

		player.updatePhysics(151)
		expect(eventSpy).to.have.been.calledOnce

		player.updatePhysics(451)
		expect(eventSpy).to.have.been.calledThrice

		timer.Enabled = false
		player.updatePhysics(601)
		expect(eventSpy).to.have.been.calledThrice // still 3x
	})

	it('should not exectue a disabled timer', () => {
		const timer = table.timers.TimerDisabled.getApi()
		const eventSpy = sinon.spy()
		timer.on('Timer', eventSpy)
		player.updatePhysics(120)
		expect(eventSpy).to.have.been.not.called
	})

	it('should alias Interval/Enabled to TimerInterval/TimerEnabled', async () => {
		const timer = table.timers.Timer1.getApi()

		timer.Interval = 321
		expect(timer.TimerInterval).to.equal(321)
		timer.TimerInterval = 123
		expect(timer.Interval).to.equal(123)

		timer.Enabled = false
		expect(timer.TimerEnabled).to.equal(false)
		timer.TimerEnabled = true
		expect(timer.Enabled).to.equal(true)
	})

	it('should default timers to enabled with a 100ms interval', async () => {
		const root = new TimerDataRoot()
		expect(root.enabled).to.equal(true)
		expect(root.interval).to.equal(100)

		// Missing TMON/TMIN tags keep the default.
		const record = new Uint8Array(8)
		new DataView(record.buffer).setInt32(0, 4, true)
		record.set([0x45, 0x4e, 0x44, 0x42], 4) // ENDB
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
		const data = await TimerData.fromStorage(storage as unknown as Storage, 'Timer1')
		expect(data.timer.enabled).to.equal(true)
		expect(data.timer.interval).to.equal(100)
	})
})

describe('The VPinball timer backglass flag', () => {
	it('should parse the backglass flag into a declared field', async () => {
		const record = new Uint8Array(20)
		const view = new DataView(record.buffer)
		view.setInt32(0, 8, true)
		record.set([0x42, 0x47, 0x4c, 0x53], 4) // BGLS
		view.setInt32(8, 1, true)
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
		const data = await TimerData.fromStorage(storage as unknown as Storage, 'Timer1')
		expect(data.isBackglass).to.equal(true)
	})
})
