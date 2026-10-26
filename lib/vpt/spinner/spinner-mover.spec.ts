// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { MathUtils } from 'three'
import { createBall } from '../../../test/physics.helper'
import { TableBuilder } from '../../../test/table-builder.js'
import { ThreeHelper } from '../../../test/three.helper'
import { Player } from '../../game/player.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { HitCircle } from '../../physics/hit-circle.js'
import { Table } from '../table/table.js'
import type { SpinnerState } from './spinner-state.js'

chai.use((sinonChai as any).default ?? sinonChai)
const three = new ThreeHelper()

describe('The VPinball spinner collision', () => {
	let table: Table
	let player: Player

	before(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-spinner.vpx')))
	})

	beforeEach(() => {
		player = new Player(table).init()
	})

	it('should make the spinner spin', () => {
		const spinner = table.spinners.Transformed

		// create ball
		createBall(player, 400, 1000, 0, 0, 10)

		// assert initial position
		expect(spinner.getState().angle).to.equal(0)

		// wait for hit
		player.updatePhysics(0)
		player.updatePhysics(160)

		// assert rotated position
		expect(spinner.getState().angle).to.be.above(5)
	})

	it('should make blocked spinner spin', () => {
		const spinner = table.spinners.Spinner

		// create ball
		const kicker = table.kickers.BallRelease.getApi()
		const _ball = kicker.CreateBall()
		kicker.Kick(0, -10)

		// assert initial position
		expect(spinner.getState().angle).to.equal(0)

		// wait for hit
		player.updatePhysics(0)
		player.updatePhysics(250)

		// assert rotated position
		expect(spinner.getState().angle).to.be.below(MathUtils.degToRad(-70))

		// assert it stays in defined angles
		for (let i = 0; i <= 200; i++) {
			player.updatePhysics(260 + i * 10)
			expect(spinner.getState().angle).to.be.within(
				MathUtils.degToRad(spinner.angleMin),
				MathUtils.degToRad(spinner.angleMax),
			)
		}
	})

	it('should pop the correct state', () => {
		const spinner = table.spinners.Transformed

		// create ball
		createBall(player, 400, 1000, 0, 0, 10)

		// assert initial position
		expect(spinner.getState().angle).to.equal(0)

		// wait for hit
		player.updatePhysics(0)
		player.updatePhysics(160)

		const state = player.popStates().getState<SpinnerState>('Transformed')
		expect(state.angle).to.equal(spinner.getState().angle)
	})

	it('should fire Spin while a free spinner turns', () => {
		const spinner = table.spinners.Transformed
		let spins = 0
		spinner.getApi().on('Spin', () => spins++)

		createBall(player, 400, 1000, 0, 0, 10)

		player.updatePhysics(0)
		player.updatePhysics(160)
		expect(spinner.getState().angle).to.be.above(5)
		player.updatePhysics(600)
		expect(spins).to.be.greaterThan(0)
	})
})

describe('The VPinball spinner bracket hits', () => {
	function bracketCircles(showBracket: boolean): HitCircle[] {
		const table = new TableBuilder().addSpinner('spin', { showBracket }).build()
		new Player(table).init()
		return table.spinners.spin.getHitShapes().filter((hit): hit is HitCircle => hit instanceof HitCircle)
	}

	it('should add two bracket hit circles when the bracket shows', () => {
		expect(bracketCircles(true)).to.have.lengthOf(2)
	})

	it('should add no bracket hit circles when the bracket hides', () => {
		expect(bracketCircles(false)).to.have.lengthOf(0)
	})
})
