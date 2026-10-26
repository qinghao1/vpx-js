// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { ThreeHelper } from '../../../test/three.helper'
import { Player } from '../../game/player.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import type { ReadResult, Storage } from '../../io/ole-doc.js'
import { Enums } from '../enums.js'
import { Table } from '../table/table.js'
import { KickerData } from './kicker.js'

chai.use((sinonChai as any).default ?? sinonChai)
const three = new ThreeHelper()

describe('The VPinball kicker API', () => {
	let table: Table
	let player: Player

	before(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-kicker.vpx')))
	})

	beforeEach(async () => {
		player = new Player(table).init()
	})

	it('should correctly read and write the properties', async () => {
		const kicker = table.kickers.Williams.getApi()

		kicker.X = 4
		expect(kicker.X).to.equal(4)
		kicker.Y = 5
		expect(kicker.Y).to.equal(5)
		kicker.Surface = 'foobar'
		expect(kicker.Surface).to.equal('foobar')
		kicker.Enabled = false
		expect(kicker.Enabled).to.equal(false)
		kicker.Enabled = true
		expect(kicker.Enabled).to.equal(true)
		kicker.Scatter = 0.110243
		expect(kicker.Scatter).to.equal(0.110243)
		kicker.HitAccuracy = 0.43318
		expect(kicker.HitAccuracy).to.equal(0.43318)
		kicker.HitHeight = 23.0012
		expect(kicker.HitHeight).to.equal(23.0012)
		kicker.Orientation = 2.33229467
		expect(kicker.Orientation).to.equal(2.33229467)
		kicker.Radius = 32.003978
		expect(kicker.Radius).to.equal(32.003978)
		kicker.FallThrough = true
		expect(kicker.FallThrough).to.equal(true)
		kicker.FallThrough = false
		expect(kicker.FallThrough).to.equal(false)
		kicker.Legacy = true
		expect(kicker.Legacy).to.equal(true)
		kicker.Legacy = false
		expect(kicker.Legacy).to.equal(false)
		kicker.DrawStyle = 99
		expect(kicker.DrawStyle).to.equal(Enums.KickerType.KickerInvisible)
		kicker.Material = 'doesntexist'
		expect(kicker.Material).to.equal('doesntexist')

		kicker.Name = 'duh-doh'
		expect(kicker.Name).to.equal('duh-doh')
		kicker.TimerInterval = 5513
		expect(kicker.TimerInterval).to.equal(5513)
		kicker.TimerEnabled = false
		expect(kicker.TimerEnabled).to.equal(false)
		kicker.TimerEnabled = true
		expect(kicker.TimerEnabled).to.equal(true)

		kicker.UserValue = 'sup'
		expect(kicker.UserValue).to.equal('sup')

		// reset table for next tests
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-kicker.vpx')))
	})

	it('should clamp the draw style and sync the kicker type', () => {
		const item = table.kickers.Williams
		const kicker = item.getApi()
		const originalType = item.data.kickerType

		kicker.DrawStyle = 99
		expect(kicker.DrawStyle).to.equal(Enums.KickerType.KickerInvisible)
		expect(item.data.kickerType).to.equal(Enums.KickerType.KickerInvisible)
		expect(item.getMeshes(table).kicker.isVisible).to.equal(false)

		kicker.KickerType = Enums.KickerType.KickerCup
		expect(kicker.KickerType).to.equal(Enums.KickerType.KickerCup)
		expect(item.data.kickerType).to.equal(Enums.KickerType.KickerCup)
		expect(item.getMeshes(table).kicker.isVisible).to.equal(true)

		kicker.DrawStyle = originalType
	})

	it('should create a ball', () => {
		const kicker = table.kickers.Williams.getApi()
		const ball = kicker.CreateBall()
		expect(ball.getState().pos.x).to.equal(kicker.X)
		expect(ball.getState().pos.y).to.equal(kicker.Y)
		expect(ball.getState().pos.z).to.equal(25)
		expect(player.balls.length).to.equal(1)
	})

	it('should create a sized ball', () => {
		const kicker = table.kickers.Williams.getApi()
		const ball = kicker.CreateSizedBall(20)
		expect(ball.getState().pos.x).to.equal(kicker.X)
		expect(ball.getState().pos.y).to.equal(kicker.Y)
		expect(ball.getState().pos.z).to.equal(20)
		expect(player.balls.length).to.equal(1)
	})

	it('should create a sized ball with mass', () => {
		const kicker = table.kickers.Williams.getApi()
		const ball = kicker.CreateSizedBallWithMass(50, 13)
		expect(ball.getState().pos.x).to.equal(kicker.X)
		expect(ball.getState().pos.y).to.equal(kicker.Y)
		expect(ball.getState().pos.z).to.equal(50)
		expect(ball.data.mass).to.equal(13)
		expect(player.balls.length).to.equal(1)
	})

	it('should destroy a captured ball', () => {
		const kicker = table.kickers.Williams.getApi()
		kicker.CreateBall()

		player.updatePhysics(0)
		player.updatePhysics(100)

		kicker.DestroyBall()

		player.updatePhysics(200)

		expect(player.balls.length).to.equal(0)
	})

	it('should not destroy a non-captured ball', () => {
		const kicker = table.kickers.Williams.getApi()
		kicker.CreateBall()
		kicker.Kick(0, 10)

		player.updatePhysics(0)
		player.updatePhysics(100)

		kicker.DestroyBall()

		player.updatePhysics(200)

		expect(player.balls.length).to.equal(1)
	})

	it('should kick a created ball', () => {
		const kicker = table.kickers.Williams.getApi()
		const ball = kicker.CreateBall()
		kicker.Kick(0, -10)

		player.updatePhysics(0)
		player.updatePhysics(100)

		expect(ball.getState().pos.x).to.equal(kicker.X)
		expect(ball.getState().pos.y).to.be.above(kicker.Y)
		expect(ball.getState().pos.z).to.be.below(26)
	})

	it('should kick a created ball through the Z-axis', () => {
		const kicker = table.kickers.Williams.getApi()
		const ball = kicker.CreateBall()
		kicker.KickZ(0, -10, 0, 100)

		player.updatePhysics(0)
		player.updatePhysics(50)

		expect(ball.getState().pos.x).to.equal(kicker.X)
		expect(ball.getState().pos.y).to.be.above(kicker.Y)
		expect(ball.getState().pos.z).to.be.above(100)
	})

	it('should kick a created ball with an offset', () => {
		const kicker = table.kickers.Williams.getApi()
		const ball = kicker.CreateBall()
		kicker.KickXYZ(0, -10, 0, 25, 300, 200)

		player.updatePhysics(0)
		player.updatePhysics(50)

		expect(ball.getState().pos.x).to.equal(kicker.X + 25)
		expect(ball.getState().pos.y).to.be.above(kicker.Y + 300)
		// The +200 z offset lands the ball (top z=250) inside the fixture's slanted
		// glass (z≈245.5 at the landing y), so the first step takes a genuine glass
		// bounce per upstream PhysicsEngine::AddCabinetBoundingHitShapes (slanted
		// Hit3DPoly) + Hit3DPoly::HitTest/Collide3DWall, settling at z≈193.13 rather
		// than the flat-glass free-flight value ≈202.5. 150 still proves the offset
		// (rest height without it is 25; a half offset would land ≈103).
		expect(ball.getState().pos.z).to.be.above(150)
	})

	it('should retrieve last captured ball', () => {
		// create another ball to make sure it's not the one being matched
		const otherKicker = table.kickers.Williams.getApi()
		otherKicker.CreateBall()
		otherKicker.Kick(0, -10)

		const kicker = table.kickers.Williams.getApi()
		const ball = kicker.CreateBall()
		kicker.Kick(0, -10)

		player.updatePhysics(0)
		player.updatePhysics(50)

		const capturedBall = kicker.LastCapturedBall

		expect(ball).to.equal(capturedBall)
	})

	it('should not retrieve last captured ball if it was destroyed meanwhile', () => {
		const kicker = table.kickers.Williams.getApi()
		const ball = kicker.CreateBall()
		kicker.Kick(0, -10)

		player.updatePhysics(0)
		player.updatePhysics(50)
		player.destroyBall(ball)
		player.updatePhysics(60)

		const capturedBall = kicker.LastCapturedBall

		expect(capturedBall).to.equal(null)
	})

	it('should not retrieve last captured ball if there was no ball captured', () => {
		const kicker = table.kickers.Williams.getApi()

		player.updatePhysics(0)
		player.updatePhysics(10)

		const capturedBall = kicker.LastCapturedBall

		expect(capturedBall).to.equal(null)
	})

	it('should count how many balls are in the kicker', () => {
		const kicker = table.kickers.Williams.getApi()
		kicker.CreateBall()

		player.updatePhysics(0)
		player.updatePhysics(10)

		expect(kicker.BallCntOver).to.equal(1)
	})
})

describe('The legacy kicker type tag', () => {
	async function loadWithType(value: number): Promise<KickerData> {
		const record = new Uint8Array(20)
		const view = new DataView(record.buffer)
		view.setInt32(0, 8, true)
		record.set([0x54, 0x59, 0x50, 0x45], 4) // TYPE
		view.setInt32(8, value, true)
		view.setInt32(12, 4, true)
		record.set([0x45, 0x4e, 0x44, 0x42], 16) // ENDB
		const storage = {
			async streamFiltered(
				_name: string,
				_offset: number,
				next: (result: ReadResult) => Promise<number | null>,
			): Promise<void> {
				let pos = 0
				while (pos < record.length) {
					const consumed = await next({ data: record.subarray(pos), storageOffset: pos })
					if (consumed === null) break
					pos += consumed
				}
			},
		}
		return KickerData.fromStorage(storage as unknown as Storage, 'Kicker')
	}

	it('should clamp out-of-range TYPE values to invisible like upstream', async () => {
		expect((await loadWithType(99)).kickerType).to.equal(Enums.KickerType.KickerInvisible)
	})

	it('should keep in-range TYPE values', async () => {
		expect((await loadWithType(Enums.KickerType.KickerCup2)).kickerType).to.equal(Enums.KickerType.KickerCup2)
	})
})
