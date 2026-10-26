// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { describe, expect, it, vi } from 'vitest'
import { createBall } from '../../test/physics.helper'
import { ThreeHelper } from '../../test/three.helper'
import { Event } from '../game/event.js'
import type { EventProxy } from '../game/event-proxy.js'
import { Player } from '../game/player.js'
import type { PlayerPhysics } from '../game/player-physics.js'
import { NodeBinaryReader } from '../io/binary-reader.node.js'
import { FRect3D } from '../math/bounds.js'
import { Vertex2D, Vertex3D } from '../math/vector.js'
import type { Ball } from '../vpt/ball/ball.js'
import { Table } from '../vpt/table/table.js'
import { CollisionEvent } from './collision-event.js'
import { CollisionType } from './collision-type.js'
import { EdgeSet } from './edge-set.js'
import { Hit3DPoly } from './hit-3dpoly.js'
import { HitCircle } from './hit-circle.js'
import { HitKD } from './hit-kd.js'
import { HitKDNode } from './hit-kd-node.js'
import { HitLine3D } from './hit-line-3d.js'
import { HitLineZ } from './hit-line-z.js'
import { HitKind, HitObject } from './hit-object.js'
import { HitPlane } from './hit-plane.js'
import { HitPoint } from './hit-point.js'
import { HitQuadtree } from './hit-quadtree.js'
import { HitTriangle } from './hit-triangle.js'
import { LineSeg } from './line-seg.js'
import { LineSegSlingshot } from './line-seg-slingshot.js'
import { BatchCollector } from './wasm/batched-hittest.js'
import type { LineSegViews } from './wasm/kernels.js'

describe('regression: flipper physics must launch ball (walking_dead tip bug)', () => {
	const three = new ThreeHelper()

	it('flipperRadius must scale with globalDifficulty', async () => {
		const { FlipperHit } = await import('../vpt/flipper/flipper-hit.js')
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

	it('clock init must adopt wall-clock starts above 1_000_000 usec, not 10_000_000', async () => {
		// First updatePhysics() with the wall clock at 5000 ms (initial = 5_000_000 usec):
		// adopted with the 1M threshold, ignored with the buggy 10M one.
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-flipper.vpx')))
		const player = new Player(table).init()
		const physics = player.getPhysics() as unknown as { now: () => number; curPhysicsFrameTime: number }
		physics.now = () => 5000
		expect(player.updatePhysics()).toBe(0)
		expect(physics.curPhysicsFrameTime).toBe(5_000_000)
		// Below the threshold the clock is not adopted and the sim runs instead.
		const table2 = await Table.load(new NodeBinaryReader(three.fixturePath('table-flipper.vpx')))
		const slow = new Player(table2).init()
		;(slow.getPhysics() as unknown as { now: () => number }).now = () => 500
		expect(slow.updatePhysics()).toBeGreaterThan(0)
	})

	it('globalDifficulty defaults and fallbacks must be 0.2', async () => {
		// functional: missing TDFT should give 0.2
		const { TableData } = await import('../vpt/table/table-data.js')
		const td: any = new (TableData as any)()
		expect(td.globalDifficulty).toBeCloseTo(0.2, 5)
	})

	it('plunger scatter must scale with globalDifficulty', async () => {
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-plunger.vpx')))
		const player = new Player(table).init()
		const hit = table.plungers.ModernPlunger.getHitShapes()[0] as unknown as {
			getMoverObject: () => { scatterVelocity: number }
			collide: (coll: CollisionEvent, physics: PlayerPhysics) => void
		}
		hit.getMoverObject().scatterVelocity = 10
		const physics = player.getPhysics()
		const strike = (): number => {
			const ball = createBall(player, 333, 1700, 0)
			ball.hit.vel.set(0, -50, 0)
			const coll = new CollisionEvent(ball)
			coll.hitNormal.set(0, 1, 0)
			coll.hitVel.set(0, 0)
			coll.hitDistance = 0
			hit.collide(coll, physics)
			return ball.hit.vel.y
		}
		table.data.globalDifficulty = 0
		const unscattered = strike()
		// branch-taken guard: scatter only applies when |vel.y| exceeds sv
		expect(Math.abs(unscattered)).toBeGreaterThan(10)
		table.data.globalDifficulty = 1
		const random = vi.spyOn(Math, 'random').mockReturnValue(0.75)
		try {
			const scattered = strike()
			let s = 0.75 * 2 - 1
			s *= (1 - s * s) * 2.59808 * 10
			expect(scattered).toBeCloseTo(unscattered + s, 9)
		} finally {
			random.mockRestore()
		}
	})

	it('SlopeMax/Min setters must respect overridePhysics', async () => {
		const { TableApi } = await import('../vpt/table/table-api.js')
		const { DEFAULT_TABLE_MIN_SLOPE, DEFAULT_TABLE_MAX_SLOPE, DEFAULT_TABLE_GRAVITY } = await import(
			'./constants.js'
		)
		const setup = (overridePhysics: boolean) => {
			const data: any = {
				angleTiltMax: 6,
				angletiltMin: 1,
				overridePhysics,
				globalDifficulty: 0.5,
				gravity: 1.5,
				bgCurrentSet: 0,
			}
			const calls: Array<[number, number]> = []
			const player: any = {
				setGravity: (slope: number, gravity: number) => {
					calls.push([slope, gravity])
				},
			}
			return { data, calls, api: new (TableApi as any)(data, {}, player, {}) as any }
		}
		// override on: slope from override constants
		{
			const { api, calls } = setup(true)
			api.SlopeMax = 9
			expect(calls).toHaveLength(1)
			const [slope, gravity] = calls[0] as [number, number]
			expect(slope).toBeCloseTo(
				DEFAULT_TABLE_MIN_SLOPE + (DEFAULT_TABLE_MAX_SLOPE - DEFAULT_TABLE_MIN_SLOPE) * 0.5,
				9,
			)
			expect(gravity).toBe(DEFAULT_TABLE_GRAVITY)
		}
		// override off: slope from table data
		{
			const { api, calls } = setup(false)
			api.SlopeMin = 2
			expect(calls).toHaveLength(1)
			const [slope, gravity] = calls[0] as [number, number]
			expect(slope).toBeCloseTo(2 + (6 - 2) * 0.5, 9)
			expect(gravity).toBe(1.5)
		}
	})
})

describe('regression: comprehensive audit (flipper EOS, bumper, collider sync)', () => {
	it('flipper EOS torque lerp must be u^4 not 4th root', async () => {
		const { FlipperMover } = await import('../vpt/flipper/flipper-mover.js')
		const { MathUtils } = await import('three')
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
		const eosAngle = MathUtils.degToRad(6)
		const state: any = { angle: 0 }
		const mover: any = new (FlipperMover as any)(
			config,
			data,
			state,
			{ fireVoidEventParm: () => {} },
			{},
			tableData,
		)
		// ctor resets angle to angleStart; park it halfway through the EOS band
		state.angle = 1 - 0.5 * eosAngle
		mover.setSolenoidState(true)
		for (let i = 0; i < 200; i++) mover.updateVelocities()
		// u = 0.5: correct u^4 = 0.0625, buggy 4th root = 0.8409
		const lerp = 0.5 * 0.5 * (0.5 * 0.5)
		expect(mover.curTorque).toBeCloseTo(2200 * (lerp + 0.75 * (1 - lerp)), 6)
	})

	it('bumper skirt must use Math.atan not Math.tan', async () => {
		const { BumperAnimation } = await import('../vpt/bumper/bumper-physics.js')
		const data: any = { center: { x: 0, y: 0 }, ringDropOffset: 0, heightScale: 1, ringSpeed: 1 }
		const state: any = { ringOffset: 0, skirtRotX: 0, skirtRotY: 0 }
		const events: any = { fireGroupEvent: () => {} }
		const anim: any = new (BumperAnimation as any)(data, state, events)
		anim.ballHitPosition = { x: 10, y: 10 }
		anim.updateSkirtState()
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
		anim.updateSkirtState()
		expect(state.skirtRotY).toBeCloseTo(0, 4)
		expect(state.skirtRotX).toBeCloseTo(-5, 4)
	})

	it('TriggerApi.Enabled must sync all hit colliders', async () => {
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
	})

	it('BumperApi.Collidable must sync hit.isEnabled', async () => {
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
	})

	it('KickerApi.Enabled must sync data.isEnabled and hit.isEnabled; Scatter passthrough', async () => {
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

	it('PlungerApi.ScatterVelocity must sync mover', async () => {
		const { PlungerApi } = await import('../vpt/plunger/plunger-api.js')
		const mover = { scatterVelocity: 0 }
		const data: any = { scatterVelocity: 0 }
		const hit: any = { getMoverObject: () => mover }
		const api: any = new (PlungerApi as any)(data, {}, hit, {}, {}, {}, {})
		api.ScatterVelocity = 7
		expect(data.scatterVelocity).toBe(7)
		expect(mover.scatterVelocity).toBe(7)
		expect(api.ScatterVelocity).toBe(7)
	})

	it('Light defaults must be RGB 0xffa957 not BGR 0x57a9ff', async () => {
		const { LightData } = await import('../vpt/light/light.js')
		const d: any = new (LightData as any)()
		expect(d.color).toBe(0xffa957)
		expect(d.color2).toBe(0xffffff)
		expect(d.color).not.toBe(0x57a9ff)
	})

	it('Matrix orthoNormalize must remain orthonormal', async () => {
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
})

describe('regression: scalar hit-test fallbacks must skip disabled colliders', () => {
	class CountingHit extends HitObject {
		public calls = 0
		public override hitKind = HitKind.Other
		public constructor(disabled: boolean) {
			super()
			this.isEnabled = !disabled
			this.hitBBox.left = -10
			this.hitBBox.right = 10
			this.hitBBox.top = -10
			this.hitBBox.bottom = 10
			this.hitBBox.zlow = -10
			this.hitBBox.zhigh = 10
		}
		public override calcHitBBox(): void {}
		public override hitTest(): number {
			this.calls++
			return 0
		}
		public override collide(): void {}
	}

	function makeBall(): Ball {
		const box = new FRect3D()
		box.left = -10
		box.right = 10
		box.top = -10
		box.bottom = 10
		box.zlow = -10
		box.zhigh = 10
		return {
			state: { pos: new Vertex3D(0, 0, 0) },
			hit: { hitBBox: box, rcHitRadiusSqr: 1e12 },
			data: { radius: 25 },
		} as unknown as Ball
	}

	function makePhysics(): { recordContacts: boolean; contacts: never[] } {
		return { recordContacts: false, contacts: [] }
	}

	it('quadtree scalar fallback skips disabled hitters but tests enabled ones', () => {
		const disabled = new CountingHit(true)
		const enabled = new CountingHit(false)
		const tree = new HitQuadtree()
		tree.addElement(disabled)
		tree.addElement(enabled)
		const ball = makeBall()
		const coll = new CollisionEvent(ball)
		coll.hitTime = 1
		;(
			tree as unknown as { hitTestBallScalar: (ball: Ball, coll: CollisionEvent, physics: unknown) => void }
		).hitTestBallScalar(ball, coll, makePhysics())
		expect(disabled.calls).toBe(0)
		expect(enabled.calls).toBe(1)
		expect(coll.obj).toBe(enabled)
	})

	it('kd-node scalar fallback skips disabled hitters but tests enabled ones', () => {
		const disabled = new CountingHit(true)
		const enabled = new CountingHit(false)
		const kd = new HitKD()
		kd.init([disabled, enabled])
		;(kd as unknown as { orgIdx: number[] }).orgIdx = [0, 1]
		const node = new HitKDNode(kd)
		node.start = 0
		node.items = 2
		const ball = makeBall()
		const coll = new CollisionEvent(ball)
		coll.hitTime = 1
		;(
			node as unknown as { hitTestBallScalar: (ball: Ball, coll: CollisionEvent, physics: unknown) => void }
		).hitTestBallScalar(ball, coll, makePhysics())
		expect(disabled.calls).toBe(0)
		expect(enabled.calls).toBe(1)
		expect(coll.obj).toBe(enabled)
	})
})

describe('regression: doHitTest must not clobber a recorded hit on miss', () => {
	class MissAfterWriteHit extends HitObject {
		public override hitKind = HitKind.Other
		public override calcHitBBox(): void {}
		public override hitTest(_ball: Ball, _dTime: number, coll: CollisionEvent): number {
			// Mirrors HitFlipper::HitTestFlipperFace, which fills the normal
			// before bailing out when the ball recedes (bnv > C_LOWNORMVEL).
			coll.hitNormal.set(0.99, 0.01, 0)
			coll.hitVel.set(0.02, 0.98)
			coll.hitMomentBit = false
			coll.hitFlag = false
			coll.hitDistance = 0.01
			return -1
		}
		public override collide(): void {}
	}

	it('non-recording miss preserves the previously recorded hit', () => {
		const ball = {
			state: { pos: new Vertex3D(0, 0, 25) },
			hit: { vel: new Vertex3D(0, 0, 0) },
			data: { radius: 25 },
		} as unknown as Ball
		const winner = new MissAfterWriteHit()
		const coll = new CollisionEvent(ball)
		coll.obj = winner
		coll.hitTime = 0.001
		coll.hitNormal.set(0, 0, 1)
		coll.hitDistance = -0.5
		coll.hitVel.set(9, 9)
		coll.hitMomentBit = true
		coll.hitFlag = true
		new MissAfterWriteHit().doHitTest(ball, coll, { recordContacts: false } as unknown as PlayerPhysics)
		expect(coll.obj).toBe(winner)
		expect(coll.hitTime).toBe(0.001)
		expect([coll.hitNormal.x, coll.hitNormal.y, coll.hitNormal.z]).toEqual([0, 0, 1])
		expect(coll.hitDistance).toBe(-0.5)
		expect([coll.hitVel.x, coll.hitVel.y]).toEqual([9, 9])
		expect(coll.hitMomentBit).toBe(true)
		expect(coll.hitFlag).toBe(true)
	})
})

describe('regression: wasm replay must gate contacts on shrunken hitTime', () => {
	class FixedHit extends HitObject {
		public override hitKind = HitKind.Other
		public constructor(private readonly fixedTime: number) {
			super()
		}
		public override calcHitBBox(): void {}
		public override hitTest(_ball: Ball, _dTime: number, coll: CollisionEvent): number {
			coll.hitNormal.set(0, 0, 1)
			coll.hitDistance = 0.01
			return this.fixedTime
		}
		public override collide(): void {}
	}

	function contactSegCase() {
		// Ball resting 0.02 above a LineSeg with zero normal velocity: the scalar
		// path reports a contact at time 0 (FIX_PHYSICS); the replay views below
		// still carry the legacy fake time the unported WASM kernel emits.
		const ball = {
			state: { pos: new Vertex3D(50, 25.02, 25), isFrozen: false },
			hit: { vel: new Vertex3D(0, 0, 0) },
			data: { radius: 25 },
		} as unknown as Ball
		const seg = new LineSeg(new Vertex2D(0, 0), new Vertex2D(100, 0), 0, 50)
		const probe = new CollisionEvent(ball)
		const contactTime = seg.hitTest(ball, 1, probe)
		expect(probe.isContact).toBe(true)
		expect(contactTime).toBe(0)
		return { ball, seg, probe }
	}

	function segViews(probe: CollisionEvent, contactTime: number): unknown {
		return {
			oT: new Float32Array([contactTime]),
			oContact: new Int32Array([1]),
			oNx: new Float32Array([probe.hitNormal.x]),
			oNy: new Float32Array([probe.hitNormal.y]),
			oNz: new Float32Array([probe.hitNormal.z]),
			oDist: new Float32Array([probe.hitDistance]),
			oBnv: new Float32Array([probe.hitOrgNormalVelocity]),
		}
	}

	function replayWithEarlyHit(earlyTime: number) {
		const { ball, seg, probe } = contactSegCase()
		const collector = new BatchCollector()
		collector.order.push(
			{ obj: new FixedHit(earlyTime), kind: HitKind.Other, idx: -1 },
			{ obj: seg, kind: HitKind.LineSeg, idx: 0 },
		)
		collector.orderLen = 2
		// Synthetic kernel output: 0.02 * (0.5 / 0.05) + 0.5, the legacy fake time.
		collector.views.lineSeg = segViews(probe, 0.7) as unknown as LineSegViews
		const coll = new CollisionEvent(ball)
		coll.hitTime = 1
		const physics = { recordContacts: true, contacts: [] } as unknown as PlayerPhysics
		collector.replay(ball, coll, physics)
		return { coll, physics }
	}

	it('shared replay drops a contact past the shrunken hitTime', () => {
		const { coll, physics } = replayWithEarlyHit(0.2)
		expect(coll.hitTime).toBe(0.2)
		expect(physics.contacts).toHaveLength(0)
	})

	it('shared replay keeps a contact inside the shrunken hitTime', () => {
		const { coll, physics } = replayWithEarlyHit(0.9)
		expect(coll.hitTime).toBe(0.9)
		expect(physics.contacts).toHaveLength(1)
	})
})

describe('regression: FIX_PHYSICS touch band reports a contact at hittime 0', () => {
	function touchBall(x: number, y: number, z: number): Ball {
		return {
			state: { pos: new Vertex3D(x, y, z), isFrozen: false },
			hit: { vel: new Vertex3D(0, 0, 0) },
			data: { radius: 25 },
		} as unknown as Ball
	}

	it('LineSeg slow touch is a contact at time 0, not a fake future time', () => {
		const ball = touchBall(50, 25.02, 25)
		const seg = new LineSeg(new Vertex2D(0, 0), new Vertex2D(100, 0), 0, 50)
		const coll = new CollisionEvent(ball)
		expect(seg.hitTest(ball, 1, coll)).toBe(0)
		expect(coll.isContact).toBe(true)
		expect(coll.hitOrgNormalVelocity).toBe(0)
	})

	it('Hit3DPoly slow touch is a contact at time 0', () => {
		const poly = new Hit3DPoly([
			new Vertex3D(0, 0, 0),
			new Vertex3D(0, 100, 0),
			new Vertex3D(100, 100, 0),
			new Vertex3D(100, 0, 0),
		])
		expect(poly.normal.z).toBeCloseTo(1, 9)
		const ball = touchBall(50, 50, 25.02)
		const coll = new CollisionEvent(ball)
		expect(poly.hitTest(ball, 1, coll)).toBe(0)
		expect(coll.isContact).toBe(true)
		expect(coll.hitOrgNormalVelocity).toBe(0)
	})

	it('HitPlane slow touch stays a contact at time 0', () => {
		const plane = new HitPlane(new Vertex3D(0, 0, 1), 0)
		const ball = touchBall(0, 0, 25.02)
		const coll = new CollisionEvent(ball)
		expect(plane.hitTest(ball, 1, coll)).toBe(0)
		expect(coll.isContact).toBe(true)
	})

	it('HitPlane embedded slow ball collides instead of tunneling through', () => {
		const plane = new HitPlane(new Vertex3D(0, 0, 1), 0)
		const ball = touchBall(0, 0, 25 - 0.1)
		const coll = new CollisionEvent(ball)
		expect(plane.hitTest(ball, 1, coll)).toBe(0)
		expect(coll.isContact).toBe(false)
	})
})

describe('physics: calcHitBBox per shape', () => {
	it('LineSeg bbox spans its endpoints and z range', () => {
		const seg = new LineSeg(new Vertex2D(10, 30), new Vertex2D(50, 5), 7, 70)
		const b = seg.hitBBox
		expect([b.left, b.right, b.top, b.bottom, b.zlow, b.zhigh]).toEqual([10, 50, 5, 30, 7, 70])
	})

	it('HitCircle bbox spans center ± radius', () => {
		const circle = new HitCircle(new Vertex2D(100, 200), 25, 0, 50)
		circle.calcHitBBox()
		const b = circle.hitBBox
		expect([b.left, b.right, b.top, b.bottom, b.zlow, b.zhigh]).toEqual([75, 125, 175, 225, 0, 50])
	})

	it('HitLineZ bbox collapses to the line position', () => {
		const line = new HitLineZ(new Vertex2D(3, 4), 10, 60)
		line.calcHitBBox()
		const b = line.hitBBox
		expect([b.left, b.right, b.top, b.bottom, b.zlow, b.zhigh]).toEqual([3, 3, 4, 4, 10, 60])
	})

	it('HitPoint bbox collapses to the point', () => {
		const point = new HitPoint(new Vertex3D(1, 2, 3))
		point.calcHitBBox()
		const b = point.hitBBox
		expect([b.left, b.right, b.top, b.bottom, b.zlow, b.zhigh]).toEqual([1, 1, 2, 2, 3, 3])
	})

	it('HitTriangle bbox spans its vertices', () => {
		const tri = new HitTriangle([new Vertex3D(0, 0, 5), new Vertex3D(10, 0, 15), new Vertex3D(0, 20, 10)])
		tri.calcHitBBox()
		const b = tri.hitBBox
		expect([b.left, b.right, b.top, b.bottom, b.zlow, b.zhigh]).toEqual([0, 10, 0, 20, 5, 15])
	})

	it('Hit3DPoly bbox spans its vertices', () => {
		const poly = new Hit3DPoly([
			new Vertex3D(0, 0, 0),
			new Vertex3D(0, 100, 0),
			new Vertex3D(100, 100, 50),
			new Vertex3D(100, 0, 50),
		])
		poly.calcHitBBox()
		const b = poly.hitBBox
		expect([b.left, b.right, b.top, b.bottom, b.zlow, b.zhigh]).toEqual([0, 100, 0, 100, 0, 50])
	})

	it('HitPlane calcHitBBox is a no-op (infinite plane)', () => {
		const plane = new HitPlane(new Vertex3D(0, 0, 1), 0)
		plane.hitBBox.left = 1
		plane.hitBBox.right = 2
		plane.calcHitBBox()
		expect(plane.hitBBox.left).toBe(1)
		expect(plane.hitBBox.right).toBe(2)
	})

	it('HitLine3D keeps its constructor bbox (calcHitBBox no-op)', () => {
		const line = new HitLine3D(new Vertex3D(0, 0, 0), new Vertex3D(10, 20, 100))
		const b = line.hitBBox
		expect([b.left, b.right, b.top, b.bottom, b.zlow, b.zhigh]).toEqual([0, 10, 0, 20, 0, 100])
		line.calcHitBBox()
		expect([b.left, b.right, b.top, b.bottom, b.zlow, b.zhigh]).toEqual([0, 10, 0, 20, 0, 100])
	})
})

describe('physics: EdgeSet', () => {
	it('treats edges as unordered pairs', () => {
		const edges = new EdgeSet()
		expect(edges.has(1, 2)).toBe(false)
		edges.add(1, 2)
		expect(edges.has(1, 2)).toBe(true)
		expect(edges.has(2, 1)).toBe(true)
		expect(edges.has(1, 3)).toBe(false)
	})

	it('addHitEdge dedupes shared mesh edges regardless of order', () => {
		const edges = new EdgeSet()
		const a = new Vertex3D(0, 0, 0)
		const b = new Vertex3D(1, 0, 0)
		const first = edges.addHitEdge(0, 1, a, b)
		expect(first).toHaveLength(1)
		expect(first[0]).toBeInstanceOf(HitLine3D)
		expect(edges.addHitEdge(1, 0, b, a)).toHaveLength(0)
		expect(edges.addHitEdge(0, 1, a, b)).toHaveLength(0)
		expect(edges.addHitEdge(1, 2, b, new Vertex3D(1, 1, 0))).toHaveLength(1)
	})
})

describe('physics: LineSeg hit cases', () => {
	function segBall(x: number, y: number, z: number, vx: number, vy: number, vz: number): Ball {
		return {
			state: { pos: new Vertex3D(x, y, z), isFrozen: false },
			hit: { vel: new Vertex3D(vx, vy, vz) },
			data: { radius: 25 },
		} as unknown as Ball
	}

	// Segment (0,0)-(100,0) has face normal (0,1).
	function wall(): LineSeg {
		return new LineSeg(new Vertex2D(0, 0), new Vertex2D(100, 0), 0, 50)
	}

	it('hits the face head-on with the face normal', () => {
		const ball = segBall(50, 50, 25, 0, -10, 0)
		const coll = new CollisionEvent(ball)
		expect(wall().hitTest(ball, 10, coll)).toBeCloseTo(2.5, 9)
		expect([coll.hitNormal.x, coll.hitNormal.y, coll.hitNormal.z]).toEqual([0, 1, 0])
		expect(coll.hitDistance).toBeCloseTo(25, 9)
		expect(coll.isContact).toBe(false)
	})

	it('misses a receding ball', () => {
		const ball = segBall(50, 50, 25, 0, 10, 0)
		expect(wall().hitTest(ball, 10, new CollisionEvent(ball))).toBe(-1)
	})

	it('misses past either endpoint', () => {
		const pastEnd = segBall(150, 50, 25, 0, -10, 0)
		expect(wall().hitTest(pastEnd, 10, new CollisionEvent(pastEnd))).toBe(-1)
		const pastStart = segBall(-50, 50, 25, 0, -10, 0)
		expect(wall().hitTest(pastStart, 10, new CollisionEvent(pastStart))).toBe(-1)
	})

	it('misses outside the z span, hits on its boundary', () => {
		const above = segBall(50, 50, 62.6, 0, -10, 0)
		expect(wall().hitTest(above, 10, new CollisionEvent(above))).toBe(-1)
		const boundary = segBall(50, 50, 62.5, 0, -10, 0)
		expect(wall().hitTest(boundary, 10, new CollisionEvent(boundary))).toBeCloseTo(2.5, 9)
	})

	it('adds the ball radius to bnd for Spinner/Gate segments', () => {
		const plain = new LineSeg(new Vertex2D(0, 0), new Vertex2D(100, 0), 0, 50)
		const spinner = new LineSeg(new Vertex2D(0, 0), new Vertex2D(100, 0), 0, 50, CollisionType.Spinner)
		// Gate-style call: any face, lateral, non-rigid.
		const ball = segBall(50, 50, 25, 0, -10, 0)
		const collPlain = new CollisionEvent(ball)
		const collSpinner = new CollisionEvent(ball)
		expect(plain.hitTestBasic(ball, 10, collPlain, false, true, false)).toBeCloseTo(2.5, 9)
		expect(spinner.hitTestBasic(ball, 10, collSpinner, false, true, false)).toBeCloseTo(7.5, 9)
		expect(collPlain.hitDistance).toBeCloseTo(25, 9)
		expect(collSpinner.hitDistance).toBeCloseTo(75, 9)
	})
})

describe('physics: HitCircle hit cases', () => {
	class TestCircle extends HitCircle {
		public probe(
			ball: Ball,
			dTime: number,
			coll: CollisionEvent,
			direction: boolean,
			lateral: boolean,
			rigid: boolean,
		): number {
			return this.hitTestBasicRadius(ball, dTime, coll, direction, lateral, rigid)
		}
	}

	function circleBall(
		x: number,
		y: number,
		z: number,
		vx: number,
		vy: number,
		vz: number,
		volObjs: unknown[] = [],
	): Ball {
		return {
			state: { pos: new Vertex3D(x, y, z), isFrozen: false },
			hit: { vel: new Vertex3D(vx, vy, vz), vpVolObjs: volObjs, isRealBall: () => true },
			data: { radius: 25 },
		} as unknown as Ball
	}

	it('hits laterally with a radial normal', () => {
		const circle = new HitCircle(new Vertex2D(0, 0), 10, 0, 50)
		const ball = circleBall(60, 0, 25, -10, 0, 0)
		const coll = new CollisionEvent(ball)
		// Contact when centers are 35 apart: (60-35)/10.
		expect(circle.hitTest(ball, 10, coll)).toBeCloseTo(2.5, 9)
		expect([coll.hitNormal.x, coll.hitNormal.y, coll.hitNormal.z]).toEqual([1, 0, 0])
		expect(coll.hitDistance).toBeCloseTo(25, 9)
		expect(coll.isContact).toBe(false)
	})

	it('treats a ball above the cap as a 3D capsule, not a 2D miss', () => {
		const circle = new TestCircle(new Vertex2D(0, 0), 10, 0, 50)
		const ball = circleBall(0, 0, 100, 0, 0, -10)
		const coll = new CollisionEvent(ball)
		// Capsule target radius 26 at dz 74: (74-26)/10. A 2D test would miss (bcdd 0).
		expect(circle.probe(ball, 10, coll, true, false, true)).toBeCloseTo(4.8, 9)
		expect([coll.hitNormal.x, coll.hitNormal.y, coll.hitNormal.z]).toEqual([0, 1, 0])
	})

	it('kicker branch drops a slow enclosed ball from the volume set', () => {
		const events = {} as unknown as EventProxy
		const kicker = new TestCircle(new Vertex2D(0, 0), 25, 0, 50)
		kicker.objType = CollisionType.Kicker
		kicker.obj = events
		const volObjs: unknown[] = [events]
		const ball = circleBall(10, 0, 25, 0.01, 0, 0, volObjs)
		const coll = new CollisionEvent(ball)
		// Kicker-style call: any face, not lateral, non-rigid.
		expect(kicker.probe(ball, 10, coll, false, false, false)).toBe(0)
		expect(volObjs).toHaveLength(0)
		expect(coll.hitFlag).toBe(false)
	})

	it('plain circle leaves the volume set alone for the same slow enclosed ball', () => {
		const events = {} as unknown as EventProxy
		const circle = new TestCircle(new Vertex2D(0, 0), 25, 0, 50)
		circle.obj = events
		const volObjs: unknown[] = [events]
		const ball = circleBall(10, 0, 25, 0.01, 0, 0, volObjs)
		expect(circle.probe(ball, 10, new CollisionEvent(ball), false, false, false)).toBe(-1)
		expect(volObjs).toHaveLength(1)
	})

	it('trigger branch reports hit inside the volume and unhit outside it', () => {
		const events = {} as unknown as EventProxy
		const trigger = new TestCircle(new Vertex2D(0, 0), 25, 0, 50)
		trigger.objType = CollisionType.Trigger
		trigger.obj = events
		const entering = circleBall(10, 0, 25, 1, 0, 0, [])
		const hitColl = new CollisionEvent(entering)
		expect(trigger.probe(entering, 10, hitColl, false, false, false)).toBe(0)
		expect(hitColl.hitFlag).toBe(false)
		const leaving = circleBall(100, 0, 25, 1, 0, 0, [events])
		const unhitColl = new CollisionEvent(leaving)
		expect(trigger.probe(leaving, 10, unhitColl, false, false, false)).toBe(0)
		expect(unhitColl.hitFlag).toBe(true)
	})
})

describe('physics: HitLineZ and HitPoint hit cases', () => {
	function freeBall(x: number, y: number, z: number, vx: number, vy: number, vz: number): Ball {
		return {
			state: { pos: new Vertex3D(x, y, z) },
			hit: { vel: new Vertex3D(vx, vy, vz) },
			data: { radius: 25 },
		} as unknown as Ball
	}

	it('HitLineZ solves the quadratic for a closing ball', () => {
		const line = new HitLineZ(new Vertex2D(0, 0), 0, 50)
		const ball = freeBall(100, 0, 25, -10, 0, 0)
		const coll = new CollisionEvent(ball)
		// Contact when the center is 25 out: (100-25)/10.
		expect(line.hitTest(ball, 10, coll)).toBeCloseTo(7.5, 9)
		expect([coll.hitNormal.x, coll.hitNormal.y, coll.hitNormal.z]).toEqual([1, 0, 0])
		expect(coll.isContact).toBe(false)
	})

	it('HitLineZ contacts inside the touch band and misses a static ball outside it', () => {
		const line = new HitLineZ(new Vertex2D(0, 0), 0, 50)
		const touching = freeBall(25.049, 0, 25, 0, 0, 0)
		const coll = new CollisionEvent(touching)
		expect(line.hitTest(touching, 10, coll)).toBe(0)
		expect(coll.isContact).toBe(true)
		expect(coll.hitOrgNormalVelocity).toBe(0)
		const outside = freeBall(25.051, 0, 25, 0, 0, 0)
		expect(line.hitTest(outside, 10, new CollisionEvent(outside))).toBe(-1)
	})

	it('HitLineZ misses a ball exactly at its center', () => {
		const line = new HitLineZ(new Vertex2D(0, 0), 0, 50)
		const ball = freeBall(0, 0, 25, -10, 0, 0)
		expect(line.hitTest(ball, 10, new CollisionEvent(ball))).toBe(-1)
	})

	it('HitPoint solves the quadratic for a closing ball', () => {
		const point = new HitPoint(new Vertex3D(0, 0, 25))
		const ball = freeBall(100, 0, 25, -10, 0, 0)
		const coll = new CollisionEvent(ball)
		expect(point.hitTest(ball, 10, coll)).toBeCloseTo(7.5, 9)
		expect([coll.hitNormal.x, coll.hitNormal.y, coll.hitNormal.z]).toEqual([1, 0, 0])
		expect(coll.isContact).toBe(false)
	})

	it('HitPoint contacts inside the touch band and misses a static ball outside it', () => {
		const point = new HitPoint(new Vertex3D(0, 0, 25))
		const touching = freeBall(25.049, 0, 25, 0, 0, 0)
		const coll = new CollisionEvent(touching)
		expect(point.hitTest(touching, 10, coll)).toBe(0)
		expect(coll.isContact).toBe(true)
		const outside = freeBall(25.051, 0, 25, 0, 0, 0)
		expect(point.hitTest(outside, 10, new CollisionEvent(outside))).toBe(-1)
	})

	it('HitPoint misses a ball exactly at its center', () => {
		const point = new HitPoint(new Vertex3D(0, 0, 25))
		const ball = freeBall(0, 0, 25, -10, 0, 0)
		expect(point.hitTest(ball, 10, new CollisionEvent(ball))).toBe(-1)
	})
})

describe('physics: Hit3DPoly rigid and trigger cases', () => {
	function quad(objType?: CollisionType): Hit3DPoly {
		return new Hit3DPoly(
			[new Vertex3D(0, 0, 0), new Vertex3D(0, 100, 0), new Vertex3D(100, 100, 0), new Vertex3D(100, 0, 0)],
			objType,
		)
	}

	function polyBall(x: number, y: number, z: number, vx: number, vy: number, vz: number, vol: unknown[]): Ball {
		return {
			state: { pos: new Vertex3D(x, y, z) },
			hit: { vel: new Vertex3D(vx, vy, vz), vpVolObjs: vol, isRealBall: () => true },
			data: { radius: 25 },
		} as unknown as Ball
	}

	function mockEvents(): { fired: Event[]; proxy: EventProxy } {
		const fired: Event[] = []
		const proxy = { fireGroupEvent: (e: Event) => fired.push(e) } as unknown as EventProxy
		return { fired, proxy }
	}

	it('hits rigidly with the face normal and distance', () => {
		const poly = quad()
		const ball = polyBall(50, 50, 100, 0, 0, -10, [])
		const coll = new CollisionEvent(ball)
		expect(poly.hitTest(ball, 10, coll)).toBeCloseTo(7.5, 9)
		expect(coll.hitNormal.x).toBeCloseTo(0, 9)
		expect(coll.hitNormal.y).toBeCloseTo(0, 9)
		expect(coll.hitNormal.z).toBeCloseTo(1, 9)
		expect(coll.hitDistance).toBeCloseTo(75, 9)
		expect(coll.isContact).toBe(false)
	})

	it('misses a ball aimed outside the polygon', () => {
		const poly = quad()
		const ball = polyBall(200, 50, 100, 0, 0, -10, [])
		expect(poly.hitTest(ball, 10, new CollisionEvent(ball))).toBe(-1)
	})

	it('collides at time 0 when embedded past the touch band', () => {
		const poly = quad()
		const ball = polyBall(50, 50, 10, 0, 0, 0, [])
		const coll = new CollisionEvent(ball)
		expect(poly.hitTest(ball, 10, coll)).toBe(0)
		expect(coll.isContact).toBe(false)
	})

	it('trigger volume toggles Hit on entry and Unhit on exit', () => {
		const { fired, proxy } = mockEvents()
		const poly = quad(CollisionType.Trigger)
		poly.obj = proxy
		// Entry: above the face, moving down.
		const vol: unknown[] = []
		const entering = polyBall(50, 50, 100, 0, 0, -10, vol)
		const hitColl = new CollisionEvent(entering)
		expect(poly.hitTest(entering, 10, hitColl)).toBeCloseTo(7.5, 9)
		expect(hitColl.hitFlag).toBe(false)
		poly.collide(hitColl)
		expect(vol).toEqual([proxy])
		expect(fired).toEqual([Event.HitEventsHit])
		expect(entering.state.pos.z).toBeCloseTo(99.8, 9)
		// Exit: below the face, moving up.
		const leaving = polyBall(50, 50, -50, 0, 0, 10, vol)
		const unhitColl = new CollisionEvent(leaving)
		expect(poly.hitTest(leaving, 10, unhitColl)).toBeCloseTo(7.5, 9)
		expect(unhitColl.hitFlag).toBe(true)
		poly.collide(unhitColl)
		expect(vol).toHaveLength(0)
		expect(fired).toEqual([Event.HitEventsHit, Event.HitEventsUnhit])
	})

	it('trigger collide ignores a flag that disagrees with the volume set', () => {
		const { fired, proxy } = mockEvents()
		const poly = quad(CollisionType.Trigger)
		poly.obj = proxy
		const vol: unknown[] = []
		const ball = polyBall(50, 50, 100, 0, 0, -10, vol)
		const coll = new CollisionEvent(ball)
		coll.hitFlag = true
		poly.collide(coll)
		expect(vol).toHaveLength(0)
		expect(fired).toHaveLength(0)
	})
})

describe('physics: HitPlane push-out', () => {
	function planeBall(x: number, y: number, z: number): Ball {
		return {
			state: { pos: new Vertex3D(x, y, z) },
			hit: { vel: new Vertex3D(0, 0, 0), collide3DWall: () => {} },
			data: { radius: 25 },
		} as unknown as Ball
	}

	it('pushes an embedded ball out along the normal on collide', () => {
		const plane = new HitPlane(new Vertex3D(0, 0, 1), 0)
		const ball = planeBall(10, 20, 24.9)
		const coll = new CollisionEvent(ball)
		coll.hitNormal.set(0, 0, 1)
		plane.collide(coll)
		expect(ball.state.pos.x).toBe(10)
		expect(ball.state.pos.y).toBe(20)
		expect(ball.state.pos.z).toBeCloseTo(25, 9)
	})

	it('leaves a clear ball where it is on collide', () => {
		const plane = new HitPlane(new Vertex3D(0, 0, 1), 0)
		const ball = planeBall(10, 20, 30)
		const coll = new CollisionEvent(ball)
		coll.hitNormal.set(0, 0, 1)
		plane.collide(coll)
		expect([ball.state.pos.x, ball.state.pos.y, ball.state.pos.z]).toEqual([10, 20, 30])
	})
})

describe('physics: HitKD and quadtree build and traversal', () => {
	class ProbeHit extends HitObject {
		public calls = 0
		public override hitKind = HitKind.Other
		public constructor(
			left: number,
			right: number,
			top: number,
			bottom: number,
			zlow: number,
			zhigh: number,
			private readonly result: number = 0,
		) {
			super()
			this.hitBBox.left = left
			this.hitBBox.right = right
			this.hitBBox.top = top
			this.hitBBox.bottom = bottom
			this.hitBBox.zlow = zlow
			this.hitBBox.zhigh = zhigh
		}
		public override calcHitBBox(): void {}
		public override hitTest(_ball: Ball, _dTime: number, coll: CollisionEvent): number {
			this.calls++
			if (this.result >= 0) {
				coll.hitNormal.set(0, 0, 1)
				coll.hitDistance = 0.01
			}
			return this.result
		}
		public override collide(): void {}
	}

	function treeBall(box: FRect3D, x: number, y: number, z: number): Ball {
		return {
			state: { pos: new Vertex3D(x, y, z) },
			hit: { hitBBox: box, rcHitRadiusSqr: 1e12 },
		} as unknown as Ball
	}

	function treePhysics(): PlayerPhysics {
		return { recordContacts: false, contacts: [] } as unknown as PlayerPhysics
	}

	it('HitKD brute-force path records a hit without splitting', () => {
		const probe = new ProbeHit(0, 10, 0, 10, 0, 10)
		const kd = new HitKD()
		kd.fillFromVector([probe])
		expect(kd.numNodes).toBe(0)
		const ball = treeBall(new FRect3D(0, 10, 0, 10, 0, 10), 5, 5, 5)
		const coll = new CollisionEvent(ball)
		coll.hitTime = 1
		kd.hitTestBall(ball, coll, treePhysics())
		expect(probe.calls).toBe(1)
		expect(coll.obj).toBe(probe)
	})

	it('HitKD tree path splits and routes to the near items only', () => {
		const probes: ProbeHit[] = []
		for (let i = 0; i < 20; i++) {
			probes.push(new ProbeHit(i * 100, i * 100 + 10, -5, 5, -5, 5, i === 0 ? 0 : -1))
		}
		const kd = new HitKD()
		kd.fillFromVector(probes)
		expect(kd.numNodes).toBeGreaterThan(0)
		const ball = treeBall(new FRect3D(0, 10, -5, 5, -5, 5), 5, 0, 0)
		const coll = new CollisionEvent(ball)
		coll.hitTime = 1
		kd.hitTestBall(ball, coll, treePhysics())
		const [first] = probes
		expect(first?.calls).toBe(1)
		expect(coll.obj).toBe(first)
		for (let i = 10; i < 20; i++) expect(probes[i]?.calls).toBe(0)
	})

	it('quadtree split routes a ball to its own quadrant only', () => {
		const tree = new HitQuadtree()
		const near: ProbeHit[] = []
		for (let i = 0; i < 5; i++) near.push(new ProbeHit(i, i + 1, i, i + 1, 0, 10))
		const far = new ProbeHit(60, 70, 60, 70, 0, 10)
		for (const probe of [...near, far]) tree.addElement(probe)
		// initialize() warms wasm pools; split directly to stay hermetic.
		const splitter = tree as unknown as {
			createNextLevel: (b: FRect3D, level: number, levelEmpty: number) => void
		}
		splitter.createNextLevel(new FRect3D(0, 100, 0, 100, 0, 10), 0, 0)
		const ball = treeBall(new FRect3D(60, 70, 60, 70, 0, 10), 65, 65, 5)
		const coll = new CollisionEvent(ball)
		coll.hitTime = 1
		const scalar = tree as unknown as {
			hitTestBallScalar: (ball: Ball, coll: CollisionEvent, physics: unknown) => void
		}
		scalar.hitTestBallScalar(ball, coll, treePhysics())
		expect(far.calls).toBe(1)
		expect(coll.obj).toBe(far)
		for (const probe of near) expect(probe.calls).toBe(0)
	})
})

describe('physics: CollisionEvent pool', () => {
	function poolBall(): Ball {
		return { state: { pos: new Vertex3D(1, 2, 3) } } as unknown as Ball
	}

	it('claim binds the ball and release resets every field', () => {
		const ballA = poolBall()
		const e = CollisionEvent.claim(ballA)
		expect(e.ball).toBe(ballA)
		e.obj = new LineSeg(new Vertex2D(0, 0), new Vertex2D(1, 0), 0, 1)
		e.isContact = true
		e.hitTime = 0.5
		e.hitDistance = 3
		e.hitNormal.set(1, 2, 3)
		e.hitVel.set(4, 5)
		e.hitOrgNormalVelocity = 6
		e.hitMomentBit = false
		e.hitFlag = true
		CollisionEvent.releaseOne(e)
		const ballB = poolBall()
		const reused = CollisionEvent.claim(ballB)
		expect(reused).toBe(e)
		expect(reused.ball).toBe(ballB)
		expect(reused.obj).toBeUndefined()
		expect(reused.isContact).toBe(false)
		expect(reused.hitTime).toBe(0)
		expect(reused.hitDistance).toBe(0)
		expect([reused.hitNormal.x, reused.hitNormal.y, reused.hitNormal.z]).toEqual([0, 0, 0])
		expect([reused.hitVel.x, reused.hitVel.y]).toEqual([0, 0])
		expect(reused.hitOrgNormalVelocity).toBe(0)
		expect(reused.hitMomentBit).toBe(true)
		expect(reused.hitFlag).toBe(false)
		CollisionEvent.releaseOne(reused)
	})

	it('release returns several events to the pool at once', () => {
		const a = CollisionEvent.claim(poolBall())
		const b = CollisionEvent.claim(poolBall())
		CollisionEvent.release(a, b)
		const c = CollisionEvent.claim(poolBall())
		const d = CollisionEvent.claim(poolBall())
		expect(new Set([c, d])).toEqual(new Set([a, b]))
		CollisionEvent.release(c, d)
	})
})

describe('physics: slingshot kick and events', () => {
	function slingSetup(threshold: number, disabled: boolean): { sling: LineSegSlingshot; fired: Event[] } {
		const surfaceData = { isDisabled: disabled, slingshotThreshold: threshold }
		const sling = new LineSegSlingshot(
			{} as any,
			surfaceData as any,
			new Vertex2D(0, 0),
			new Vertex2D(100, 0),
			0,
			100,
		)
		sling.force = 10
		const fired: Event[] = []
		;(sling as any).obj = { fireGroupEvent: (e: Event) => fired.push(e) }
		sling.fe = true
		return { sling, fired }
	}

	function slingBall(x: number, y: number, vx: number, vy: number, ex = 50, ey = 50): Ball {
		return {
			data: { radius: 25 },
			state: { pos: new Vertex3D(x, y, 0) },
			hit: {
				vel: new Vertex3D(vx, vy, 0),
				eventPos: new Vertex3D(ex, ey, 0),
				collide3DWall: () => {},
			},
		} as unknown as Ball
	}

	function slingColl(ball: Ball): CollisionEvent {
		return { ball, hitNormal: new Vertex3D(0, 1, 0) } as unknown as CollisionEvent
	}

	it('a disabled slingshot neither kicks nor fires', () => {
		const { sling, fired } = slingSetup(0, true)
		const ball = slingBall(50, -1, 0, -10)
		sling.collide(slingColl(ball))
		expect(fired).toHaveLength(0)
		expect(ball.hit.vel.y).toBe(-10)
	})

	it('kicks hardest at the center and not at all at the edges', () => {
		const { sling } = slingSetup(0, false)
		// Center: full parabolic peak 0.5 * force.
		const center = slingBall(50, -1, 0, -10)
		sling.collide(slingColl(center))
		expect(center.hit.vel.y).toBeCloseTo(-15, 9)
		// Quarter point: 0.5 * (1 - 0.5^2) * force.
		const quarter = slingBall(25, -1, 0, -10)
		sling.collide(slingColl(quarter))
		expect(quarter.hit.vel.y).toBeCloseTo(-13.75, 9)
		// Edges: falloff reaches zero.
		for (const x of [0, 100]) {
			const edge = slingBall(x, -1, 0, -10)
			sling.collide(slingColl(edge))
			expect(edge.hit.vel.y).toBe(-10)
		}
	})

	it('dedupes repeat events at the same spot but fires after moving on', () => {
		const { sling, fired } = slingSetup(0, false)
		const ball = slingBall(50, -1, 0, -10)
		const coll = slingColl(ball)
		sling.collide(coll)
		expect(fired).toEqual([Event.SurfaceEventsSlingshot])
		sling.collide(coll)
		expect(fired).toHaveLength(1)
		ball.state.pos.set(50, -30, 0)
		sling.collide(coll)
		expect(fired).toHaveLength(2)
	})

	it('fires on the threshold boundary but not above it', () => {
		const { sling, fired } = slingSetup(5, false)
		const boundary = slingBall(50, -1, 0, -5)
		sling.collide(slingColl(boundary))
		expect(fired).toHaveLength(1)
		const above = slingBall(50, -1, 0, -4.999)
		sling.collide(slingColl(above))
		expect(fired).toHaveLength(1)
		expect(above.hit.vel.y).toBe(-4.999)
	})
})
