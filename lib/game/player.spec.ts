// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import { TableBuilder } from '../../test/table-builder.js'
import { ThreeHelper } from '../../test/three.helper'
import { ChangedStates, Player } from '../game/player.js'
import { NodeBinaryReader } from '../io/binary-reader.node.js'
import { Table } from '../vpt/table/table.js'

describe('The VPinball player', () => {
	const three = new ThreeHelper()

	it('should pause and resume the game', async () => {
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-kicker.vpx')))
		const player = new Player(table).init()
		const kicker = table.kickers.BallRelease.getApi()

		const ball = kicker.CreateBall()
		kicker.Kick(0, 10)

		player.simulateTime(0)
		expect(ball.getState().pos.y).to.equal(1200)

		player.simulateTime(120)
		expect(ball.getState().pos.y).to.be.below(1100)

		player.pause()
		player.simulateTime(700)
		expect(ball.getState().pos.y).to.be.above(1090)

		player.resume()
		player.simulateTime(1400)
		expect(ball.getState().pos.y).to.be.below(650)
	})

	it('should not fire game-sync timers while paused', async () => {
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-timer.vpx')))
		const player = new Player(table).init()
		const timer = table.timers.Timer1.getApi()
		timer.Enabled = true
		timer.Interval = -2
		let fires = 0
		timer.on('Timer', () => fires++)

		player.updatePhysics(100)
		expect(fires).to.equal(1)

		player.pause()
		player.updatePhysics(200)
		player.updatePhysics(300)
		expect(fires).to.equal(1)

		player.resume()
		player.updatePhysics(400)
		expect(fires).to.equal(2)
	})

	it('should still fire frame-sync timers while paused', async () => {
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-timer.vpx')))
		const player = new Player(table).init()
		const timer = table.timers.Timer1.getApi()
		timer.Enabled = true
		timer.Interval = -1
		let fires = 0
		timer.on('Timer', () => fires++)

		player.updatePhysics(100)
		expect(fires).to.equal(1)

		player.pause()
		player.updatePhysics(200)
		expect(fires).to.equal(2)
	})

	it('should not rewind clocks when explicit time goes backwards while paused', () => {
		const table = new TableBuilder().withTableScript('').build('Table1')
		const player = new Player(table).init({})

		player.updatePhysics(100)
		player.pause()
		player.updatePhysics(50)

		player.resume()
		// Grid must still sit at 100ms: resuming to 150 runs 50 steps, not 100.
		expect(player.updatePhysics(150)).to.equal(50)
		expect(player.getGameTime()).to.equal(150)
	})

	it('should keep physics behind wall clock by up to one step', async () => {
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-timer.vpx')))
		const player = new Player(table).init()

		// Like upstream PhysicsEngine, a step runs only once its end reached the wall
		// clock, so physics never runs ahead of real time (at most one step behind).
		expect(player.updatePhysics(0.5)).to.equal(0)
		expect(player.updatePhysics(1)).to.equal(1)
		expect(player.updatePhysics(1.5)).to.equal(0)
		expect(player.updatePhysics(2.5)).to.equal(1)
	})

	it('should clamp wall-clock catch-up to at most 50 steps on heavy frames', async () => {
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-timer.vpx')))
		const player = new Player(table).init()
		player.updatePhysics(10)

		// Wall-clock path only: a huge gap runs MAX_CATCHUP steps instead of
		// spiralling through 1 kHz catch-up (explicit times run full catch-up).
		const realNow = performance.now.bind(performance)
		performance.now = () => 10_000
		try {
			expect(player.updatePhysics()).to.equal(50)
		} finally {
			performance.now = realNow
		}
	})

	it('should not fire 1ms timers ahead of the wall clock', async () => {
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-timer.vpx')))
		const player = new Player(table).init()
		const timer = table.timers.Timer1.getApi()
		timer.Enabled = true
		timer.Interval = 1
		let fires = 0
		timer.on('Timer', () => fires++)

		player.updatePhysics(1.5)
		expect(fires).to.equal(0)

		player.updatePhysics(2.5)
		expect(fires).to.equal(1)
	})

	it('should broadcast OptionEvent(0) on finishInit', async () => {
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-kicker.vpx')))
		let receivedEventId: number | undefined
		const player = new Player(table)
		table.getApi().on('OptionEvent', (eventId: number) => {
			receivedEventId = eventId
		})
		player.init()
		expect(receivedEventId).to.equal(0)
	})

	it('should wrap collection items so mutating collection elements marks items dirty', async () => {
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-collection.vpx')))
		new Player(table).init()

		const collection = table.collections.FireSurpress
		expect(collection).to.exist
		expect(collection.items.length).to.be.above(0)

		const firstItemApi = collection.items[0] as unknown as { __isDirtyProxy?: boolean; Enabled?: boolean }
		expect(firstItemApi).to.exist
		expect(firstItemApi.__isDirtyProxy).to.equal(true)
	})

	it('should run zero iterations at time zero and one per millisecond after', async () => {
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-timer.vpx')))
		const player = new Player(table).init()
		expect(player.updatePhysics(0)).to.equal(0)

		const table2 = await Table.load(new NodeBinaryReader(three.fixturePath('table-timer.vpx')))
		const player2 = new Player(table2).init()
		expect(player2.updatePhysics(16)).to.equal(16)
	})

	it('should return an empty ChangedStates shape on first popStates', async () => {
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-timer.vpx')))
		const player = new Player(table).init()
		expect(player.balls.length).to.equal(0)

		const states = player.popStates()
		expect(states).to.be.an.instanceof(ChangedStates)
		expect(states.isEmpty).to.equal(true)
		expect(states.keys).to.deep.equal([])
		expect(states.states).to.deep.equal([])
		expect(states.changedStates).to.deep.equal({})
		expect(states.getState('no-such-item')).to.equal(undefined)
	})
})
