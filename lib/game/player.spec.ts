// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import { TableBuilder } from '../../test/table-builder.js'
import { ThreeHelper } from '../../test/three.helper'
import { NodeBinaryReader } from '../io/binary-reader.node.js'
import { Vertex3D } from '../math/vector.js'
import { Table } from '../vpt/table/table.js'
import { type IBallCreationPosition, Player } from './player.js'

/** Read-only view of the player's pending-dirty set (no monkey-patching). */
function dirtyOf(player: Player): Set<string> {
	return (player as unknown as { dirtySet: Set<string> }).dirtySet
}

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
		// Clock must still sit at 100ms, so resuming to 150 runs 50 steps.
		expect(player.updatePhysics(150)).to.equal(50)
		expect(player.getGameTime()).to.equal(150)
	})

	it('should keep physics behind wall clock by up to one step', async () => {
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-timer.vpx')))
		const player = new Player(table).init()

		// Steps run only once their end reached the wall clock (upstream: never ahead of real time).
		expect(player.updatePhysics(0.5)).to.equal(0)
		expect(player.updatePhysics(1)).to.equal(1)
		expect(player.updatePhysics(1.5)).to.equal(0)
		expect(player.updatePhysics(2.5)).to.equal(1)
	})

	it('should clamp wall-clock catch-up to at most 50 steps on heavy frames', async () => {
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-timer.vpx')))
		const player = new Player(table).init()
		player.updatePhysics(10)

		// Wall-clock gaps clamp to MAX_CATCHUP steps instead of a 1 kHz catch-up spiral.
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

	it('should mark items dirty when collection elements are mutated', async () => {
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-collection.vpx')))
		const player = new Player(table).init()
		player.popStates()

		// Mutating through the collection entry must mark the item dirty
		// (set-only dirty marking, no monkey-patching). Assert the dirty
		// contract itself: popStates may still filter the diff when the
		// mutation leaves the diffed state equal.
		const itemApi = table.collections.FireSurpress.items[0] as unknown as { Enabled: boolean; Name: string }
		itemApi.Enabled = !itemApi.Enabled
		expect(dirtyOf(player).has(itemApi.Name)).to.equal(true)
	})

	it('should not dirty state on reads', async () => {
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-collection.vpx')))
		const player = new Player(table).init()
		player.popStates()

		const itemApi = table.collections.FireSurpress.items[0] as unknown as { Enabled: boolean; Name: string }
		void itemApi.Name
		void itemApi.Enabled
		expect(dirtyOf(player).size).to.equal(0)
	})

	it('should fire frame-sync timers once per updatePhysics call', async () => {
		// One-call-one-frame: each updatePhysics call is one headless frame, so
		// a repeated same-timestamp call fires -1/-2 again (upstream fires -1
		// per render frame and -2 per game-logic frame instead).
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-timer.vpx')))
		const player = new Player(table).init()
		const timer = table.timers.Timer1.getApi()
		timer.Enabled = true
		timer.Interval = -1
		let fires = 0
		timer.on('Timer', () => fires++)

		player.updatePhysics(100)
		expect(fires).to.equal(1)
		player.updatePhysics(100)
		expect(fires).to.equal(2)
	})

	it('should run zero iterations at time zero and one per millisecond after', async () => {
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-timer.vpx')))
		const player = new Player(table).init()
		expect(player.updatePhysics(0)).to.equal(0)

		const table2 = await Table.load(new NodeBinaryReader(three.fixturePath('table-timer.vpx')))
		const player2 = new Player(table2).init()
		expect(player2.updatePhysics(16)).to.equal(16)
	})

	it('should report no changes on first popStates and track new balls after', async () => {
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-timer.vpx')))
		const player = new Player(table).init()
		expect(player.balls.length).to.equal(0)

		const first = player.popStates()
		expect(first.isEmpty).to.equal(true)
		expect(first.keys).to.deep.equal([])
		expect(first.getState('no-such-item')).to.equal(undefined)

		const creator: IBallCreationPosition = {
			getBallCreationPosition: (): Vertex3D => new Vertex3D(1000, 1000, 100),
			getBallCreationVelocity: (): Vertex3D => new Vertex3D(0, 0, 0),
			onBallCreated: (): void => {},
		}
		const ball = player.createBall(creator)
		player.updatePhysics(10)
		const second = player.popStates()
		expect(second.isEmpty).to.equal(false)
		expect(second.getState(ball.getName())).to.not.equal(undefined)
	})
})
