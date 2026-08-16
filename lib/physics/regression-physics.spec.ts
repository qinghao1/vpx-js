// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import * as fssync from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createBall } from '../../test/physics.helper'
import { ThreeHelper } from '../../test/three.helper'
import { Player } from '../game/player.js'
import { NodeBinaryReader } from '../io/binary-reader.node.js'
import { Table } from '../vpt/table/table.js'

describe('regression: flipper physics must launch ball (walking_dead tip bug)', () => {
	const three = new ThreeHelper()

	it('flipperRadius must scale with globalDifficulty', async () => {
		const { FlipperHit } = await import('../vpt/flipper/flipper-hit.js')
		const src = fssync.readFileSync('lib/vpt/flipper/flipper-hit.ts', 'utf-8')
		expect(src).toContain('globalDifficulty')
		expect(src).toMatch(/flipperRadiusMax.*flipperRadiusMin.*\*.*globalDifficulty/)
		// functional: difficulty 0 => max, 1 => min, 0.5 => mid
		const table: any = {
			data: { globalDifficulty: 0.2, globalEmissionScale: 1 },
			getSurfaceHeight: () => 0,
		}
		const data: any = {
			center: { x: 0, y: 0 },
			baseRadius: 21,
			endRadius: 13,
			flipperRadiusMax: 130,
			flipperRadiusMin: 80,
			flipperRadius: 130,
			startAngle: 0,
			endAngle: 30,
			szSurface: '',
			height: 50,
			updatePhysicsSettings: () => {},
			getName: () => 'TestFlipper',
		}
		const state: any = { angle: 0 }
		const events: any = { fireVoidEventParm: () => {} }
		const physics: any = {}
		table.data.globalDifficulty = 0
		const _hit0 = FlipperHit.getInstance(data, state, events, physics, table)
		// with difficulty 0, radius should be max (130)
		expect(data.flipperRadius).toBeCloseTo(130, 1)
		// reset for next
		data.flipperRadiusMax = 130
		data.flipperRadiusMin = 80
		table.data.globalDifficulty = 1
		FlipperHit.getInstance(data, state, events, physics, table)
		expect(data.flipperRadius).toBeCloseTo(80, 1)
		data.flipperRadiusMax = 130
		data.flipperRadiusMin = 80
		table.data.globalDifficulty = 0.5
		FlipperHit.getInstance(data, state, events, physics, table)
		expect(data.flipperRadius).toBeCloseTo(105, 1)
		// buggy code was Max - (Max-Min) = Min always, would give 80 even at diff 0
		// this test would catch that: at diff 0, buggy gives 80 not 130
	})

	it('flipper inertia must be (1/3)*m*r^2', async () => {
		const src = fssync.readFileSync('lib/vpt/flipper/flipper-mover.ts', 'utf-8')
		expect(src).toContain('(1 / 3) *')
		expect(src).toMatch(/inertia = \(1 \/ 3\)/)
		const { FlipperMover } = await import('../vpt/flipper/flipper-mover.js')
		const config: any = {
			center: { x: 0, y: 0 },
			baseRadius: 21.5,
			endRadius: 13,
			flipperRadius: 130,
			angleStart: 0,
			angleEnd: 1,
			zLow: 0,
			zHigh: 50,
		}
		const data: any = {
			getName: () => 'Test',
			mass: 1,
			overrideMass: 1,
			overridePhysics: 0,
			strength: 2200,
			return: 0.058,
			torqueDamping: 0.75,
			torqueDampingAngle: 6,
			rampUp: 3,
			elasticity: 0.8,
			elasticityFalloff: 0.43,
			friction: 0.6,
			scatter: 0,
		}
		const tableData: any = { globalDifficulty: 0.2, overridePhysics: false, overridePhysicsFlipper: false }
		// mock mass 1, radius 130 => inertia 1/3*1*16900 = 5633.33
		const mover: any = new (FlipperMover as any)(
			config,
			data,
			{ angle: 0 },
			{ fireVoidEventParm: () => {} },
			{},
			tableData,
		)
		expect(mover.inertia).toBeCloseTo((1 / 3) * 1 * 130 * 130, 1)
		// check getFlipperMass inverse
		const massViaInertia = (3 * mover.inertia) / (130 * 130)
		expect(massViaInertia).toBeCloseTo(1, 2)
	})

	it('CLOCK_INIT_THRESHOLD_USEC must be 1_000_000 not 10_000_000', () => {
		const src = fssync.readFileSync('lib/game/player-physics.ts', 'utf-8')
		expect(src).toContain('CLOCK_INIT_THRESHOLD_USEC = 1_000_000')
		expect(src).not.toContain('10_000_000')
	})

	it('ball launched from flipper tip must travel to top with high velocity', async () => {
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-flipper.vpx')))
		const player = new Player(table).init()
		const flipper = table.flippers.DefaultFlipper.getApi()
		// place ball near tip, similar to harness tip hit
		const ball = createBall(player, 420, 1550, 0, 0, 5)
		flipper.RotateToEnd()
		// simulate 280ms like existing spec "should move when hit at the same time"
		player.updatePhysics(0)
		player.updatePhysics(280)
		const pos = ball.getState().pos
		const vel = ball.hit.vel
		// must have moved strongly upwards (y decreasing is up in VP coords? Actually y 0 top, 2100 bottom, so up is smaller y)
		// original spec expects y below 830 after 280ms
		expect(pos.y).toBeLessThan(830)
		expect(Math.hypot(vel.x, vel.y)).toBeGreaterThan(5)
		// ensure not capped at low max speed (bug had max speed ~10) - check that ball actually moved from start
		expect(pos.y).toBeLessThan(1500)
	})

	it('ball rolling on flipper must be diverted correctly', async () => {
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-flipper.vpx')))
		const player = new Player(table).init()
		const ball = createBall(player, 350, 1600, 0)
		player.updatePhysics(0)
		player.updatePhysics(2000)
		expect(ball.getState().pos.x).toBeGreaterThan(420)
		expect(ball.getState().pos.y).toBeGreaterThan(1650)
	})

	it('flipper must push ball up when rotating', async () => {
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-flipper.vpx')))
		const player = new Player(table).init()
		const flipper = table.flippers.DefaultFlipper.getApi()
		const ball = createBall(player, 310, 1590, 0)
		player.updatePhysics(0)
		player.updatePhysics(1500)
		flipper.RotateToEnd()
		player.updatePhysics(1550)
		expect(ball.getState().pos.x).toBeGreaterThan(380)
		expect(ball.getState().pos.y).toBeLessThan(1550)
	})
})
