// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import * as sinon from 'sinon'
import { TableBuilder } from '../../test/table-builder.js'
import { ThreeHelper } from '../../test/three.helper'
import { NodeBinaryReader } from '../io/binary-reader.node.js'
import { Vertex3D } from '../math/vector.js'
import { _resetQualityCache } from '../util/quality.js'
import { Table } from '../vpt/table/table.js'
import type { IEmulator } from './iemulator.js'
import { FULL_SWEEP_EVERY, type IBallCreationPosition, Player } from './player.js'

/** Runs fn with performance.now stubbed to `now`; restores the clock afterwards. */
function withStubbedNow(now: number, fn: () => void): void {
	const realNow = performance.now.bind(performance)
	performance.now = () => now
	try {
		fn()
	} finally {
		performance.now = realNow
	}
}

/** Recording stand-in for the quantum-sync transparency spec below. */
class FakeEmu {
	public readonly calls: number[] = []
	public emuSimulateCycle(ms: number): number {
		this.calls.push(ms)
		return ms
	}
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
		withStubbedNow(10_000, () => {
			expect(player.updatePhysics()).to.equal(50)
		})
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
		// (set-only dirty marking; popStates may still filter the diff when
		// the mutation leaves the diffed state equal, so spy the marking).
		const itemApi = table.collections.FireSurpress.items[0] as unknown as { Enabled: boolean; Name: string }
		const spy = sinon.spy(player, 'markDirty')
		try {
			itemApi.Enabled = !itemApi.Enabled
			expect(spy.calledWithExactly(itemApi.Name)).to.equal(true)
		} finally {
			spy.restore()
		}
	})

	it('should not dirty state on reads', async () => {
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-collection.vpx')))
		const player = new Player(table).init()
		player.popStates()

		const itemApi = table.collections.FireSurpress.items[0] as unknown as { Enabled: boolean; Name: string }
		const spy = sinon.spy(player, 'markDirty')
		try {
			void itemApi.Name
			void itemApi.Enabled
			expect(spy.callCount).to.equal(0)
		} finally {
			spy.restore()
		}
	})

	it('should surface script mutations through popStates', () => {
		const table = new TableBuilder().withTableScript('').addFlipper('LeftFlipper').build('Table1')
		const player = new Player(table).init({})
		player.popStates()

		table.flippers.LeftFlipper.getApi().RotateToEnd()
		player.updatePhysics(20)

		expect(player.popStates().keys).to.include('LeftFlipper')
	})

	it('should not mark movables dirty when no physics steps run', () => {
		const table = new TableBuilder().withTableScript('').addFlipper('F1').build('Table1')
		const player = new Player(table).init({})
		player.popStates()

		const spy = sinon.spy(player, 'markDirty')
		try {
			expect(player.updatePhysics(0.5)).to.equal(0)
			expect(spy.callCount).to.equal(0)
		} finally {
			spy.restore()
		}
		expect(player.popStates().isEmpty).to.equal(true)
	})

	it('should surface unmarked state changes on the periodic full sweep', () => {
		const table = new TableBuilder().withTableScript('').build('Table1')
		const player = new Player(table).init({})
		player.popStates()
		const creator: IBallCreationPosition = {
			getBallCreationPosition: (): Vertex3D => new Vertex3D(1000, 1000, 100),
			getBallCreationVelocity: (): Vertex3D => new Vertex3D(0, 0, 0),
			onBallCreated: (): void => {},
		}
		const ball = player.createBall(creator)
		player.popStates()

		// Bypass dirty marking: mutate the live state directly.
		ball.getState().pos.x += 500
		expect(player.popStates().isEmpty).to.equal(true)

		let surfaced: string[] = []
		for (let i = 0; i < FULL_SWEEP_EVERY + 1 && !surfaced.length; i++) {
			surfaced = player.popStates().keys
		}
		expect(surfaced).to.include(ball.getName())
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

	it('should reach the exact grid endpoint when simulating time', () => {
		const table = new TableBuilder().withTableScript('').build('Table1')
		const player = new Player(table).init({})

		// 100 ms is an exact multiple of the 1000/60 ms grid: float accumulation
		// overshoots it (100.00000000000001 > 100), which used to skip the
		// terminal step and leave game time at 83.
		player.simulateTime(100)
		expect(player.getGameTime()).to.equal(100)
	})

	it('should initialize clocks on the first wall-clock call without a catch-up spiral', () => {
		const table = new TableBuilder().withTableScript('').build('Table1')
		const player = new Player(table).init({})

		// First wall-clock frame far past the epoch: clock init consumes the
		// call (0 iterations) instead of running a 1 kHz catch-up spiral.
		withStubbedNow(5_000_000, () => {
			expect(player.updatePhysics()).to.equal(0)
		})

		// Clocks now sit at the wall time, so explicit stepping continues exactly
		// (game time is relative to sim start, hence 16 rather than 5000016).
		expect(player.updatePhysics(5_000_016)).to.equal(16)
		expect(player.getGameTime()).to.equal(16)
	})

	describe('emu sync', () => {
		function setupSyncedPlayer(): { player: Player; calls: number[] } {
			const table = new TableBuilder().withTableScript('').build('Table1')
			const player = new Player(table).init({})
			const calls: number[] = []
			player.setEmulator({
				emuSimulateCycle: (ms: number) => {
					calls.push(ms)
					return ms
				},
			} as unknown as IEmulator)
			return { player, calls }
		}

		it('should forward each tick to the emu in a single sync', () => {
			const { player, calls } = setupSyncedPlayer()
			let time = 0
			for (let tick = 0; tick < 10; tick++) {
				const before = calls.length
				time += 16.7
				player.updatePhysics(time)
				expect(calls.length - before).to.be.lessThan(2)
			}
			expect(calls.length).to.be.above(0)
		})

		it('should conserve emu time exactly across ticks', () => {
			const { player, calls } = setupSyncedPlayer()
			let time = 0
			let steps = 0
			for (let tick = 0; tick < 60; tick++) {
				time += 16.7
				steps += player.updatePhysics(time)
			}
			// One ms forwarded per simulated step, nothing carried or dropped.
			const forwarded = calls.reduce((sum, ms) => sum + ms, 0)
			expect(forwarded).to.be.closeTo(steps, 1e-6)
		})

		it('should keep the raw emu on physics.emu across re-setting', () => {
			const table = new TableBuilder().withTableScript('').build('Table1')
			const player = new Player(table).init({})
			const emu = new FakeEmu()
			player.setEmulator(emu as unknown as IEmulator)
			expect(player.getPhysics().emu).to.equal(emu)
			expect(player.getPhysics().emu instanceof FakeEmu).to.equal(true)
			// Controller reloads re-set the same emu: still the raw instance.
			player.setEmulator(player.getPhysics().emu!)
			expect(player.getPhysics().emu).to.equal(emu)
			let time = 0
			for (let tick = 0; tick < 10; tick++) {
				time += 16.7
				player.updatePhysics(time)
			}
			expect(emu.calls.length).to.be.above(0)
		})

		it('should forward exactly once per tick with conserved totals under jitter', () => {
			const { player, calls } = setupSyncedPlayer()
			let time = 0
			let steps = 0
			const jumps = [9.3, 23.7, 11.1, 27.9]
			for (let tick = 0; tick < 20; tick++) {
				const before = calls.length
				time += jumps[tick % jumps.length]!
				steps += player.updatePhysics(time)
				// Every tick advances at least one 1 ms step, so each forwards exactly once.
				expect(calls.length - before).to.equal(1)
			}
			const forwarded = calls.reduce((sum, ms) => sum + ms, 0)
			expect(forwarded).to.be.closeTo(steps, 1e-6)
		})
	})

	it('should bound explicit-time bursts to 16 steps on low-quality devices', () => {
		const table = new TableBuilder().withTableScript('').build('Table1')
		const player = new Player(table).init({})
		player.updatePhysics(10)

		// Force the low-quality branch the same way the render specs do.
		const hadWindow = 'window' in globalThis
		const hadLocation = 'location' in globalThis
		const prevWindow = (globalThis as any).window
		const prevLocation = (globalThis as any).location
		try {
			;(globalThis as any).window = { innerWidth: 1920, innerHeight: 1080 }
			;(globalThis as any).location = { search: '?quality=low' }
			_resetQualityCache()
			// 16-step budget, then the clocks fast-forward: game time advances
			// only the 16 simulated ms instead of jumping to the target.
			expect(player.updatePhysics(10_000)).to.equal(16)
			expect(player.getGameTime()).to.equal(26)
		} finally {
			// Assign rather than delete: `typeof window/location === 'undefined'`
			// still holds, and it avoids the noDelete lint.
			if (hadWindow) (globalThis as any).window = prevWindow
			else (globalThis as any).window = undefined
			if (hadLocation) (globalThis as any).location = prevLocation
			else (globalThis as any).location = undefined
			_resetQualityCache()
		}
	})

	it('should not double-fire a timer enabled twice without an intervening change', async () => {
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-timer.vpx')))
		const player = new Player(table).init()
		const timer = table.timers.Timer1.getApi()
		timer.Interval = 10
		timer.Enabled = true
		let fires = 0
		timer.on('Timer', () => fires++)

		// Api-level sets guard on change, so double-enable goes through physics
		// directly: the upsert must not register the timer twice.
		const hitTimer = (timer as any).hitTimer
		player.getPhysics().timerStateChange(hitTimer, true)
		player.getPhysics().timerStateChange(hitTimer, true)
		player.updatePhysics(35)
		expect(fires).to.equal(3)
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

	it('should return a shared empty instance from idle popStates', async () => {
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-timer.vpx')))
		const player = new Player(table).init()
		player.popStates()
		const empty1 = player.popStates()
		const empty2 = player.popStates()
		expect(empty1.isEmpty).to.equal(true)
		expect(empty2).to.equal(empty1)
		expect(() => empty1.release()).to.not.throw()
		expect(player.popStates()).to.equal(empty1)
	})
})
