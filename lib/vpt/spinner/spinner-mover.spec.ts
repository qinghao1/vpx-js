// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { createBall } from '../../../test/physics.helper'
import { ThreeHelper } from '../../../test/three.helper'
import { Player } from '../../game/player.js'
import type { PlayerPhysics } from '../../game/player-physics.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { degToRad, radToDeg } from '../../util/float.js'
import { Table } from '../table/table.js'
import type { Spinner } from './spinner.js'
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
		const ball = kicker.CreateBall()
		kicker.Kick(0, -10)

		// assert initial position
		expect(spinner.getState().angle).to.equal(0)

		// wait for hit
		player.updatePhysics(0)
		player.updatePhysics(250)

		// assert rotated position
		expect(spinner.getState().angle).to.be.below(degToRad(-70))

		// assert it stays in defined angles
		for (let i = 0; i <= 200; i++) {
			player.updatePhysics(260 + i * 10)
			expect(spinner.getState().angle).to.be.within(degToRad(spinner.angleMin), degToRad(spinner.angleMax))
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
})

/**
 * Let time pass while logging the spinner rotation.
 * @param physics
 * @param spinner
 * @param numCycles How many cycles to run
 * @param cycleLength Duration of each cycle
 */
export function debugSpinner(physics: PlayerPhysics, spinner: Spinner, numCycles = 300, cycleLength = 5) {
	for (let i = 0; i <= numCycles; i++) {
		physics.updatePhysics(i * cycleLength)
		console.log('[%sms] %s (%s°)', i * cycleLength, spinner.getState().angle, radToDeg(spinner.getState().angle))
	}
}
