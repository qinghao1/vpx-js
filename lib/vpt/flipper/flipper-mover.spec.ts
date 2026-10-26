// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { MathUtils } from 'three'
import { TableBuilder } from '../../../test/table-builder.js'
import { ThreeHelper } from '../../../test/three.helper'
import { Player } from '../../game/player.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { Table } from '../table/table.js'
import type { FlipperState } from './flipper-state.js'

chai.use((sinonChai as any).default ?? sinonChai)
const three = new ThreeHelper()

describe('The VPinball flipper physics', () => {
	let table: Table
	let player: Player

	before(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-flipper.vpx')))
	})

	beforeEach(() => {
		player = new Player(table).init()
	})

	it('should move to the end when solenoid is on', async () => {
		const flipper = table.flippers.FlipperR
		const flipperState = flipper.getState()
		const endAngleRad = MathUtils.degToRad(flipper.getFlipperData().endAngle)

		flipper.getApi().RotateToEnd()
		player.simulateTime(100)

		expect(flipperState.angle).to.equal(endAngleRad)
	})

	it('should move to the start when solenoid is off again', async () => {
		const flipper = table.flippers.FlipperR
		const flipperState = flipper.getState()
		const startAngleRad = MathUtils.degToRad(flipper.getFlipperData().startAngle)

		// move up
		flipper.getApi().RotateToEnd()
		player.updatePhysics(52) // hit at 51ms

		// move down again
		flipper.getApi().RotateToStart()
		player.updatePhysics(300)

		expect(flipperState.angle).to.equal(startAngleRad)
	})

	it('should fire LimitEOS at the end and LimitBOS at the start', async () => {
		const flipper = table.flippers.FlipperR
		const api = flipper.getApi()
		let eosCount = 0
		let bosCount = 0
		api.on('LimitEOS', () => eosCount++)
		api.on('LimitBOS', () => bosCount++)

		api.RotateToEnd()
		player.simulateTime(100)
		expect(eosCount).to.equal(1)
		expect(bosCount).to.equal(0)

		api.RotateToStart()
		player.simulateTime(400)
		expect(eosCount).to.equal(1)
		expect(bosCount).to.equal(1)
	})

	it('should move back to end when pressed while moving', async () => {
		const flipper = table.flippers.FlipperR
		const flipperState = flipper.getState()
		const startAngleRad = MathUtils.degToRad(flipper.getFlipperData().startAngle)
		const endAngleRad = MathUtils.degToRad(flipper.getFlipperData().endAngle)

		// move up
		flipper.getApi().RotateToEnd()
		player.updatePhysics(52) // hit at 51ms
		expect(flipperState.angle).to.be.above(startAngleRad)

		// move down
		flipper.getApi().RotateToStart()
		player.updatePhysics(200)

		// assert it's in the middle
		expect(flipperState.angle).to.be.above(startAngleRad)
		expect(flipperState.angle).to.be.below(endAngleRad)

		// move up again
		flipper.getApi().RotateToEnd()
		player.updatePhysics(500)

		// assert it's back up in less than half the time
		expect(flipperState.angle).to.equal(endAngleRad)
	})

	it('should claim the angle in radians before setup', () => {
		const table = new TableBuilder().addFlipper('flipper').build()
		const flipper = table.flippers.flipper

		expect(flipper.getState().angle).to.equal(MathUtils.degToRad(flipper.getFlipperData().startAngle))
	})

	it('should return the proper state', () => {
		const flipper = table.flippers.FlipperR

		// move up
		flipper.getApi().RotateToEnd()
		player.simulateTime(25) // hit at 17.012061224193429107ms (at 1000fps)

		const flipperState = flipper.getState()
		const states = player.popStates()

		const poppedState = states.getState<FlipperState>('FlipperR')

		expect(flipperState.name).to.eql(poppedState.name)
		expect(flipperState.angle).to.eql(poppedState.angle)
		states.release()
	})
})
