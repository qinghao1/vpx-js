// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { createBall } from '../../../test/physics.helper'
import { ThreeHelper } from '../../../test/three.helper'
import { Player } from '../../game/player.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { Table } from '../table/table.js'
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

		// for (let i = 0; i < 1500; i += 16.66666) {
		// 	player.updatePhysics(i);
		// 	console.log(i, trigger.getState().heightOffset);
		// }

		// let it roll onto trigger
		player.simulateTime(0)
		player.simulateTime(900)
		const state = player.popStates().getState<TriggerState>('WireB')
		expect(state.heightOffset).to.equal(trigger.getState().heightOffset)
	})
})
