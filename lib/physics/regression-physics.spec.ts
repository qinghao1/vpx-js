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

	it('globalDifficulty defaults and fallbacks must be 0.2', async () => {
		const tdSrc = fssync.readFileSync('lib/vpt/table/table-data.ts', 'utf-8')
		expect(tdSrc).toContain('globalDifficulty = 0.2')
		expect(tdSrc).not.toMatch(/globalDifficulty!:\s*number/)
		const ppSrc = fssync.readFileSync('lib/game/player-physics.ts', 'utf-8')
		expect(ppSrc).toContain('globalDifficulty ?? 0.2')
		expect(ppSrc).not.toContain('?? 0.5')
		const tblSrc = fssync.readFileSync('lib/vpt/table/table.ts', 'utf-8')
		expect(tblSrc).toContain('getGlobalDifficulty')
		expect(tblSrc).toContain('?? 0.2')
		// functional: missing TDFT should give 0.2
		const { TableData } = await import('../vpt/table/table-data.js')
		const td: any = new (TableData as any)()
		expect(td.globalDifficulty).toBeCloseTo(0.2, 5)
	})

	it('plunger scatter must scale with globalDifficulty', () => {
		const src = fssync.readFileSync('lib/vpt/plunger/plunger-hit.ts', 'utf-8')
		expect(src).toContain('getGlobalDifficulty()')
		expect(src).toMatch(/scatterVelocity \*.*getGlobalDifficulty/)
	})

	it('SlopeMax/Min setters must respect overridePhysics', () => {
		const src = fssync.readFileSync('lib/vpt/table/table-api.ts', 'utf-8')
		expect(src).toMatch(/set SlopeMax.*overrideMinSlope.*overrideMaxSlope/s)
		expect(src).toMatch(/set SlopeMin.*overrideMinSlope.*overrideMaxSlope/s)
		expect(src).toMatch(/globalDifficulty \?\? 0\.2/)
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

describe('regression: comprehensive audit (flipper EOS, bumper, collider sync)', () => {
	it('flipper EOS torque lerp must be u^4 not 4th root', () => {
		const src = fssync.readFileSync('lib/vpt/flipper/flipper-mover.ts', 'utf-8')
		expect(src).toContain('const u = Math.abs(this.state.angle - this.angleEnd) / eosAngle')
		expect(src).toContain('const u2 = u * u')
		expect(src).toContain('const lerp = u2 * u2')
		expect(src).not.toContain('Math.sqrt(Math.sqrt')
		const u = 0.5
		const correct = u * u * (u * u)
		const buggy = Math.sqrt(Math.sqrt(u))
		expect(correct).toBeCloseTo(0.0625, 4)
		expect(buggy).toBeCloseTo(0.8409, 3)
		expect(correct).not.toBeCloseTo(buggy, 1)
		const u2 = 0.1
		expect(u2 * u2 * (u2 * u2)).toBeCloseTo(0.0001, 5)
		expect(Math.sqrt(Math.sqrt(u2))).toBeCloseTo(0.5623, 3)
	})

	it('bumper skirt must use Math.atan not Math.tan', async () => {
		const src = fssync.readFileSync('lib/vpt/bumper/bumper-physics.ts', 'utf-8')
		expect(src).toContain('Math.atan(dx / dy)')
		expect(src).not.toMatch(/Math\.tan\(dx \/ dy\)/)
		const { BumperAnimation } = await import('../vpt/bumper/bumper-physics.js')
		const data: any = { center: { x: 0, y: 0 }, ringDropOffset: 0, heightScale: 1, ringSpeed: 1 }
		const state: any = { ringOffset: 0, skirtRotX: 0, skirtRotY: 0 }
		const events: any = { fireGroupEvent: () => {} }
		const anim: any = new (BumperAnimation as any)(data, state, events)
		anim.ballHitPosition = { x: 10, y: 10 }
		anim['updateSkirtState']()
		const SKIRT_TILT = 5
		const expectedA = Math.atan(10 / 10)
		// center(0,0) hit(10,10) => dy>0 dx>0, atan=45deg, but y-flip => rotX = -cos*tilt
		expect(state.skirtRotX).toBeCloseTo(-Math.cos(expectedA) * SKIRT_TILT, 4)
		expect(state.skirtRotY).toBeCloseTo(Math.sin(expectedA) * SKIRT_TILT, 4)
		expect(state.skirtRotX).toBeCloseTo(-3.5355, 2)
		const buggyA = Math.tan(10 / 10)
		const buggyX = Math.cos(buggyA) * SKIRT_TILT
		// buggy tan gives ~0.05 with flip => -0.05, not -3.53
		expect(buggyX).toBeCloseTo(0.05, 1)
		expect(state.skirtRotX).not.toBeCloseTo(buggyX, 1)
		expect(state.skirtRotX).not.toBeCloseTo(-buggyX, 1)
		anim.ballHitPosition = { x: 0, y: 10 }
		anim['updateSkirtState']()
		expect(state.skirtRotY).toBeCloseTo(0, 4)
		expect(state.skirtRotX).toBeCloseTo(-5, 4)
	})

	it('TriggerApi.Enabled must sync all hit colliders', async () => {
		const src = fssync.readFileSync('lib/vpt/trigger/trigger-api.ts', 'utf-8')
		expect(src).toContain('private readonly hits: HitObject[]')
		expect(src).toContain('for (const hit of this.hits) hit.isEnabled = v')
		const { TriggerApi } = await import('../vpt/trigger/trigger-api.js')
		const hits = [{ isEnabled: true }, { isEnabled: true }] as any
		const data: any = {
			isEnabled: true,
			center: { x: 0, y: 0 },
			radius: 10,
			szSurface: '',
			hitHeight: 10,
			rotation: 0,
			wireThickness: 1,
			animSpeed: 1,
			shape: 0,
			isReflectionEnabled: false,
		}
		const state: any = { isVisible: true, material: undefined }
		const events: any = {}
		const player: any = { balls: [] }
		const table: any = {}
		const api: any = new (TriggerApi as any)(state, data, hits, events, player, table)
		api.Enabled = false
		expect(data.isEnabled).toBe(false)
		expect(hits[0].isEnabled).toBe(false)
		expect(hits[1].isEnabled).toBe(false)
		api.Enabled = true
		expect(hits[0].isEnabled).toBe(true)
		expect(data.isEnabled).toBe(true)
		const triggerSrc = fssync.readFileSync('lib/vpt/trigger/trigger.ts', 'utf-8')
		expect(triggerSrc).toContain('new TriggerApi(this.state, this.data, this.hits,')
	})

	it('BumperApi.Collidable must sync hit.isEnabled', async () => {
		const src = fssync.readFileSync('lib/vpt/bumper/bumper.ts', 'utf-8')
		expect(src).toContain('private readonly hit: HitObject')
		expect(src).toMatch(/set Collidable[\s\S]*?this\.hit\.isEnabled = v/)
		const { BumperApi } = await import('../vpt/bumper/bumper.js')
		const hit = { isEnabled: true } as any
		const animation: any = { enableSkirtAnimation: true }
		const state: any = {
			isCapVisible: true,
			isRingVisible: true,
			isBaseVisible: true,
			isSkirtVisible: true,
			ringOffset: 0,
			skirtRotX: 0,
			skirtRotY: 0,
			capMaterial: '',
			ringMaterial: '',
			baseMaterial: '',
			skirtMaterial: '',
		}
		const data: any = {
			isCollidable: true,
			radius: 10,
			center: { x: 0, y: 0 },
			szBaseMaterial: '',
			szCapMaterial: '',
			szRingMaterial: '',
			szSkirtMaterial: '',
		}
		const events: any = {}
		const player: any = {}
		const table: any = { getMaterial: () => undefined }
		const api: any = new (BumperApi as any)(state, animation, data, events, hit, player, table)
		api.Collidable = false
		expect(data.isCollidable).toBe(false)
		expect(hit.isEnabled).toBe(false)
		api.Collidable = true
		expect(hit.isEnabled).toBe(true)
		const bumperSrc = fssync.readFileSync('lib/vpt/bumper/bumper.ts', 'utf-8')
		expect(bumperSrc).toContain('new BumperApi(this.state, this.animation, this.data, this.events, this.hit,')
	})

	it('KickerApi.Enabled must sync data.isEnabled and hit.isEnabled; Scatter passthrough', async () => {
		const src = fssync.readFileSync('lib/vpt/kicker/kicker.ts', 'utf-8')
		expect(src).toMatch(/get Enabled\(\)[\s\S]*?return this\.data\.isEnabled/)
		expect(src).toMatch(/set Enabled[\s\S]*?this\.data\.isEnabled = v[\s\S]*?this\.hit\.isEnabled = v/)
		expect(src).toMatch(/get Scatter\(\)[\s\S]*?return this\.data\.scatter/)
		const { KickerApi } = await import('../vpt/kicker/kicker.js')
		const hit: any = { isEnabled: true }
		const data: any = {
			isEnabled: true,
			scatter: 5,
			center: { x: 0, y: 0 },
			szSurface: '',
			hitAccuracy: 0.5,
			hitHeight: 35,
			orientation: 0,
			radius: 25,
			fallThrough: false,
			legacyMode: false,
		}
		const state: any = { type: 0, material: undefined }
		const events: any = {}
		const ballCreator: any = {}
		const player: any = {}
		const table: any = {}
		const api: any = new (KickerApi as any)(state, data, hit, events, ballCreator, player, table)
		api.Enabled = false
		expect(data.isEnabled).toBe(false)
		expect(hit.isEnabled).toBe(false)
		expect(api.Enabled).toBe(false)
		api.Scatter = 12
		expect(data.scatter).toBe(12)
		expect(api.Scatter).toBe(12)
	})

	it('PlungerApi.ScatterVelocity must sync mover', () => {
		const src = fssync.readFileSync('lib/vpt/plunger/plunger-api.ts', 'utf-8')
		expect(src).toContain('this.hit.getMoverObject().scatterVelocity = v')
	})

	it('Light defaults must be RGB 0xffa957 not BGR 0x57a9ff', async () => {
		const src = fssync.readFileSync('lib/vpt/light/light.ts', 'utf-8')
		expect(src).toContain('public color = 0xffa957')
		expect(src).toContain('public color2 = 0xffffff')
		expect(src).not.toContain('0x57a9ff')
		const { LightData } = await import('../vpt/light/light.js')
		const d: any = new (LightData as any)()
		expect(d.color).toBe(0xffa957)
		expect(d.color2).toBe(0xffffff)
		expect(d.color).not.toBe(0x57a9ff)
	})

	it('stdlib must use slice not deprecated substr', () => {
		const src = fssync.readFileSync('lib/scripting/stdlib/index.ts', 'utf-8')
		expect(src).toContain('.slice(0, length)')
		expect(src).toContain('.slice(s.length - length)')
		expect(src).toContain('.slice(i)')
		expect(src).toContain('.slice(i, i + length)')
		expect(src).toContain('.slice(0, obj.constructor.name.length - 3)')
		expect(src).not.toMatch(/\.substr\(/)
	})

	it('Matrix orthoNormalize must be in-place without Vector3 allocs and remain orthonormal', async () => {
		const src = fssync.readFileSync('lib/math/matrix.ts', 'utf-8')
		const ortho = src.slice(src.indexOf('orthoNormalize'))
		expect(ortho).not.toContain('new Vector3')
		expect(ortho).toContain('Math.hypot')
		const { Matrix2D } = await import('../math/matrix.js')
		const m: any = new (Matrix2D as any)()
		m.set(1, 0.2, 0, 0, 1, 0, 0, 0, 1)
		m.orthoNormalize()
		const e = m.elements
		const lenX = Math.hypot(e[0], e[1], e[2])
		const lenZ = Math.hypot(e[6], e[7], e[8])
		expect(lenX).toBeCloseTo(1, 3)
		expect(lenZ).toBeCloseTo(1, 3)
		const dot = e[0] * e[3] + e[1] * e[4] + e[2] * e[5]
		expect(Math.abs(dot)).toBeLessThan(0.01)
	})

	it('CabNudge stepOneMillisecond must reuse scratch vectors without per-tick alloc', () => {
		const src = fssync.readFileSync('lib/physics/cabinet/keyboard-nudge.ts', 'utf-8')
		expect(src).toContain('private readonly scratch = new Vertex2D()')
		expect(src).toContain('private readonly stepForce = new Vertex2D()')
		expect(src).toContain('this.scratch.x = 0')
		expect(src).toContain('this.stepForce.x =')
		const stepSrc = src.slice(src.indexOf('stepOneMillisecond'))
		expect(stepSrc).not.toMatch(/const impulse = new Vertex2D\(\)/)
		expect(stepSrc).not.toMatch(/this\.cabinet\.step\(new Vertex2D\(/)
	})
})
