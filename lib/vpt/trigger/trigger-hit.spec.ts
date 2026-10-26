// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { createBall } from '../../../test/physics.helper'
import { TableBuilder } from '../../../test/table-builder.js'
import { ThreeHelper } from '../../../test/three.helper'
import { Player } from '../../game/player.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { Vertex3D } from '../../math/vector.js'
import { DragPoint } from '../dragpoint.js'
import { Table } from '../table/table.js'
import { TriggerLineSeg } from './trigger-line-seg.js'
import type { TriggerState } from './trigger-state.js'

chai.use((sinonChai as any).default ?? sinonChai)
const three = new ThreeHelper()

describe('The VPinball trigger collision', () => {
	let table: Table
	let player: Player

	before(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-trigger.vpx')))
	})

	beforeEach(() => {
		player = new Player(table).init()
	})

	it('should collide with the ball and animate', () => {
		const trigger = table.triggers.WireB
		const kicker = table.kickers.BallRelease.getApi()
		kicker.CreateBall()
		kicker.Kick(0, -1)

		// let it roll down some
		player.simulateTime(0)
		player.simulateTime(750)

		expect(trigger.getState().heightOffset).to.equal(0)

		// let it collide
		player.simulateTime(800)

		expect(trigger.getState().heightOffset).to.equal(-32)

		// let it roll over and animate back
		player.simulateTime(1150)

		expect(trigger.getState().heightOffset).to.equal(0)
	})

	it('should collide with the ball and animate when a button trigger is hit', () => {
		const trigger = table.triggers.Button
		createBall(player, 174, 1300, 0, 0, 2)

		// let it roll down some
		player.simulateTime(0)
		player.simulateTime(500)

		expect(trigger.getState().heightOffset).to.equal(0)

		// let it collide
		player.simulateTime(600)

		expect(trigger.getState().heightOffset).to.equal(-2.5)

		// let it roll over and animate back
		player.simulateTime(820)

		expect(trigger.getState().heightOffset).to.equal(0)
	})

	it('should pop the correct state', () => {
		const trigger = table.triggers.WireB
		const kicker = table.kickers.BallRelease.getApi()
		kicker.CreateBall()
		kicker.Kick(0, -1)

		// let it roll onto trigger
		player.simulateTime(0)
		player.simulateTime(900)
		const state = player.popStates().getState<TriggerState>('WireB')
		expect(state.heightOffset).to.equal(trigger.getState().heightOffset)
	})
})

describe('The VPinball trigger winding normalization', () => {
	function segmentEnds(clockwise: boolean): Array<[number, number, number, number]> {
		// det > 0 order ("clockwise" per the winding test)
		const pts = clockwise
			? [
					[0, 0],
					[100, 0],
					[100, 100],
					[0, 100],
				]
			: [
					[0, 0],
					[0, 100],
					[100, 100],
					[100, 0],
				]
		const dragPoints = pts.map(([x, y]) => {
			const dp = new DragPoint()
			dp.vertex = new Vertex3D(x, y, 0)
			dp.fSmooth = false
			return dp
		})
		const table = new TableBuilder().addTrigger('trg', { dragPoints }).build()
		new Player(table).init()
		return table.triggers.trg
			.getHitShapes()
			.filter((hit): hit is TriggerLineSeg => hit instanceof TriggerLineSeg)
			.map((seg): [number, number, number, number] => [seg.v1.x, seg.v1.y, seg.v2.x, seg.v2.y])
	}

	it('should generate identical segments regardless of authored winding', () => {
		const byEnds = (a: [number, number, number, number], b: [number, number, number, number]) =>
			a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]
		const reversed = segmentEnds(true)
		expect(reversed).to.have.lengthOf(4)
		// Same segment set; normalization may rotate the start index.
		expect([...reversed].sort(byEnds)).to.deep.equal([...segmentEnds(false)].sort(byEnds))
	})
})
