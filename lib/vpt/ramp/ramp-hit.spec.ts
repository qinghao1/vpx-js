// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { createBall } from '../../../test/physics.helper'
import { TableBuilder } from '../../../test/table-builder.js'
import { ThreeHelper } from '../../../test/three.helper'
import { Player } from '../../game/player.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { Vertex3D } from '../../math/vector.js'
import { HitLine3D } from '../../physics/hit-line-3d.js'
import { HitLineZ } from '../../physics/hit-line-z.js'
import { LineSeg } from '../../physics/line-seg.js'
import { DragPoint } from '../dragpoint.js'
import { Enums } from '../enums.js'
import { Table } from '../table/table.js'

chai.use((sinonChai as any).default ?? sinonChai)
const three = new ThreeHelper()

describe('The VPinball ramp collision', () => {
	let table: Table
	let player: Player

	before(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-ramp.vpx')))
	})

	beforeEach(() => {
		player = new Player(table).init()
	})

	it('should make the ball roll up and down a flat ramp', () => {
		const kicker = table.kickers.BallRelease.getApi()

		// create ball
		const ball = kicker.CreateBall()
		kicker.Kick(170, -20)
		expect(ball.getState().pos.y).to.equal(1163)

		// let it roll up
		player.updatePhysics(500)
		expect(ball.getState().pos.y).to.be.below(710)

		// let it roll down again
		player.updatePhysics(1000)
		expect(ball.getState().pos.y).to.be.above(1030)
	})

	it('should make the ball roll down a two-wire ramp', () => {
		// create ball
		const ball = createBall(player, 595, 571, 105)

		expect(ball.getState().pos.x).to.be.within(594, 596)
		expect(ball.getState().pos.y).to.be.within(570, 571)
		expect(ball.getState().pos.z).to.be.within(129, 130)

		player.updatePhysics(200)
		expect(ball.getState().pos.x).to.be.within(581, 583)
		expect(ball.getState().pos.y).to.be.within(599, 601)
		expect(ball.getState().pos.z).to.be.within(96, 98)

		// FIX_PHYSICS goldens below: (538.20, 693.80, 83.05) was (537.99, 694.56, 82.95).
		player.updatePhysics(400)
		expect(ball.getState().pos.x).to.be.within(537, 539)
		expect(ball.getState().pos.y).to.be.within(693, 695)
		expect(ball.getState().pos.z).to.be.within(82, 84)

		// FIX_PHYSICS: (509.80, 843.33, 63.37) was (510.23, 844.70, 63.17).
		player.updatePhysics(600)
		expect(ball.getState().pos.x).to.be.within(509, 511)
		expect(ball.getState().pos.y).to.be.within(842, 845)
		expect(ball.getState().pos.z).to.be.within(62, 64)

		// FIX_PHYSICS: (571.99, 1028.59, 36.34) was (572.87, 1032.06, 34.95).
		player.updatePhysics(800)
		expect(ball.getState().pos.x).to.be.within(571, 573)
		expect(ball.getState().pos.y).to.be.within(1027, 1030)
		expect(ball.getState().pos.z).to.be.within(35, 38)
	})
})

describe('The VPinball ramp wire wall heights', () => {
	function wallSpans(rampType: number): number[] {
		const table = new TableBuilder()
			.addRamp('ramp', {
				rampType,
				heightTop: 0,
				heightBottom: 0,
				dragPoints: [flatDragPoint(500, 500), flatDragPoint(700, 700)],
			})
			.build()
		new Player(table).init()
		return table.ramps.ramp
			.getHitShapes()
			.filter((hit): hit is LineSeg => hit instanceof LineSeg)
			.map(hit => hit.hitBBox.zhigh - hit.hitBBox.zlow)
	}

	it('should use backwards-compatible wall heights for wire ramps', () => {
		// Upstream constants (ramp.cpp): 1/2-wire 31, 4-wire 62, 3-wire 62/18.5.
		expect(new Set(wallSpans(Enums.RampType.RampType1Wire))).to.deep.equal(new Set([31]))
		expect(new Set(wallSpans(Enums.RampType.RampType2Wire))).to.deep.equal(new Set([31]))
		expect(new Set(wallSpans(Enums.RampType.RampType4Wire))).to.deep.equal(new Set([62]))
		expect(new Set(wallSpans(Enums.RampType.RampType3WireRight))).to.deep.equal(new Set([62, 18.5]))
		expect(new Set(wallSpans(Enums.RampType.RampType3WireLeft))).to.deep.equal(new Set([62, 18.5]))
	})

	it('should use the configured wall heights for flat ramps', () => {
		const table = new TableBuilder()
			.addRamp('ramp', {
				rampType: Enums.RampType.RampTypeFlat,
				heightTop: 0,
				heightBottom: 0,
				leftWallHeight: 40,
				rightWallHeight: 45,
				dragPoints: [flatDragPoint(500, 500), flatDragPoint(700, 700)],
			})
			.build()
		new Player(table).init()
		const spans = table.ramps.ramp
			.getHitShapes()
			.filter((hit): hit is LineSeg => hit instanceof LineSeg)
			.map(hit => hit.hitBBox.zhigh - hit.hitBBox.zlow)
		expect(new Set(spans)).to.deep.equal(new Set([40, 45]))
	})
})

describe('The VPinball ramp joints', () => {
	it('should generate one joint per floor seam plus wall joints', () => {
		const table = new TableBuilder().addRamp('ramp', { rampType: Enums.RampType.RampTypeFlat }).build()
		new Player(table).init()
		const hits = table.ramps.ramp.getHitShapes()
		const joints3d = hits.filter((hit): hit is HitLine3D => hit instanceof HitLine3D)
		const jointsZ = hits.filter(hit => hit instanceof HitLineZ && !(hit instanceof HitLine3D))
		// Two-point ramp: starting/left/right/end floor edges + one seam joint,
		// and a start/end joint per wall.
		expect(joints3d).to.have.lengthOf(5)
		expect(jointsZ).to.have.lengthOf(4)

		// Upstream adds the starting edge twice (AddJoint at i==0 plus
		// CheckJoint(null, ...) on the same edge, ramp.cpp) — keep the pair.
		const boxes = joints3d.map(joint =>
			[
				joint.hitBBox.left,
				joint.hitBBox.right,
				joint.hitBBox.top,
				joint.hitBBox.bottom,
				joint.hitBBox.zlow,
				joint.hitBBox.zhigh,
			].join(','),
		)
		expect(new Set(boxes).size).to.equal(boxes.length - 1)
	})
})

function flatDragPoint(x: number, y: number): DragPoint {
	const dragPoint = new DragPoint()
	dragPoint.vertex = new Vertex3D(x, y, 0)
	return dragPoint
}
