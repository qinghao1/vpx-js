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
import { Hit3DPoly } from '../../physics/hit-3dpoly.js'
import { LineSeg } from '../../physics/line-seg.js'
import { LineSegSlingshot } from '../../physics/line-seg-slingshot.js'
import { RenderVertex } from '../../util/vertex.js'
import { DragPoint } from '../dragpoint.js'
import { Table } from '../table/table.js'
import { normalizeWindingOrder } from './surface-physics.js'

chai.use((sinonChai as any).default ?? sinonChai)
const three = new ThreeHelper()

describe('The VPinball surface collision', () => {
	let table: Table
	let player: Player

	beforeEach(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-surface.vpx')))
		player = new Player(table).init()
	})

	it('should make the ball bounce off the sides', () => {
		const kicker = table.kickers.BallRelease.getApi()

		// create ball
		const ball = kicker.CreateBall()
		kicker.Kick(90, 10)

		// let it roll right some
		player.updatePhysics(0)
		player.updatePhysics(170)

		// assert it's moving down right
		expect(ball.getState().pos.x).to.be.above(300)

		// let it hit and bounce back
		player.updatePhysics(200)

		// assert it bounced back
		expect(ball.getState().pos.x).to.be.below(300)
	})

	it('should make the ball collide on top', () => {
		// create ball
		const ball = createBall(player, 500, 500, 200, 0, 5)

		// let it roll right some
		player.updatePhysics(0)
		player.updatePhysics(300)

		// assert the ball is still on top of the surface
		// FIX_PHYSICS: rests exactly at 75.0 (was 75.005, legacy hover).
		expect(ball.getState().pos.z).to.be.above(74.99)

		// let the ball fall down
		player.updatePhysics(750)

		// assert it bounced back
		expect(ball.getState().pos.z).to.be.below(26)
	})

	it('should bounce off a slingshot', async () => {
		const slingshotTable = await Table.load(new NodeBinaryReader(three.fixturePath('table-slingshot.vpx')))
		player = new Player(slingshotTable).init()

		const slingshotKicker = slingshotTable.kickers.SlingShotKicker.getApi()
		const wallKicker = slingshotTable.kickers.WallKicker.getApi()

		const ball1 = slingshotKicker.CreateBall()
		const ball2 = wallKicker.CreateBall()

		slingshotKicker.Kick(0, -2)
		wallKicker.Kick(0, -2)

		expect(ball1.getState().pos.y).to.equal(1050)
		expect(ball2.getState().pos.y).to.equal(1050)

		// let them hit the walls and bounce back
		player.updatePhysics(1470)

		// ball 1 should be up top, while ball 2 hitting the wall should be on the wall
		expect(ball1.getState().pos.y).to.be.below(500)
		expect(ball2.getState().pos.y).to.be.within(1170, 1180)
	})

	it('should not collide with anything when dropped', () => {
		// create ball
		const ball = createBall(player, 350, 230, 0, 0, 10)

		// drop wall
		const wall = table.surfaces.Wall.getApi()
		wall.CanDrop = true
		wall.IsDropped = true

		player.updatePhysics(0)
		player.updatePhysics(100)

		// should go right through
		expect(ball.getState().pos.y).to.be.above(240)
	})

	it('should not kick the ball when the slingshot is disabled', async () => {
		const slingshotTable = await Table.load(new NodeBinaryReader(three.fixturePath('table-slingshot.vpx')))
		player = new Player(slingshotTable).init()

		// disable the slingshot wall: the kick and the slingshot event are gated
		// on isDisabled, while the plain wall bounce still applies
		slingshotTable.surfaces.Wall.getApi().Disabled = true

		const slingshotKicker = slingshotTable.kickers.SlingShotKicker.getApi()
		const ball = slingshotKicker.CreateBall()
		slingshotKicker.Kick(0, -2)

		// let it hit the wall and bounce back
		player.updatePhysics(1470)

		// not kicked: rests on the wall like a plain-wall hit, far from the top
		expect(ball.getState().pos.y).to.be.within(1170, 1180)
	})

	it('should not collide with anything when collidable set to false', () => {
		// create ball
		const ball = createBall(player, 350, 230, 0, 0, 10)

		// set colliable to false
		const wall = table.surfaces.Wall.getApi()
		wall.Collidable = false

		player.updatePhysics(0)
		player.updatePhysics(100)

		// should go right through
		expect(ball.getState().pos.y).to.be.above(240)
	})
})

describe('The VPinball bottom-solid surface', () => {
	function topAndBottomPolys(isBottomSolid: boolean): Hit3DPoly[] {
		const table = new TableBuilder().addSurface('wall', { isBottomSolid, heightTop: 50, heightBottom: 10 }).build()
		new Player(table).init()
		return table.surfaces.wall.getHitShapes().filter((hit): hit is Hit3DPoly => hit instanceof Hit3DPoly)
	}

	it('should add a reversed bottom polygon when bottom solid', () => {
		const polys = topAndBottomPolys(true)
		expect(polys).to.have.lengthOf(2)
		const levels = polys.map(poly => poly.hitBBox.zlow).sort((a, b) => a - b)
		expect(levels[0]).to.be.closeTo(10, 1e-9)
		expect(levels[1]).to.be.closeTo(50, 1e-9)
	})

	it('should only add the top polygon otherwise', () => {
		const polys = topAndBottomPolys(false)
		expect(polys).to.have.lengthOf(1)
		const [top] = polys
		expect(top.hitBBox.zlow).to.be.closeTo(50, 1e-9)
	})
})

describe('The VPinball surface winding normalization', () => {
	function square(clockwise: boolean, slingshot = -1): DragPoint[] {
		// det > 0 order ("clockwise" per the winding test)
		const pts = clockwise
			? [
					[0, 0],
					[100, 0],
					[100, 100],
					[0, 100],
				]
			: [
					[0, 0],
					[0, 100],
					[100, 100],
					[100, 0],
				]
		return pts.map(([x, y], i) => {
			const dp = new DragPoint()
			dp.vertex = new Vertex3D(x, y, 0)
			dp.fSmooth = false
			dp.fSlingshot = i === slingshot
			return dp
		})
	}

	function bottomEdgeNormals(clockwise: boolean): Array<[number, number]> {
		const table = new TableBuilder().addSurface('wall', { dragPoints: square(clockwise) }).build()
		new Player(table).init()
		return table.surfaces.wall
			.getHitShapes()
			.filter((hit): hit is LineSeg => hit instanceof LineSeg && !(hit instanceof LineSegSlingshot))
			.filter(seg => seg.v1.y === 0 && seg.v2.y === 0)
			.map((seg): [number, number] => [seg.normal.x, seg.normal.y])
	}

	it('should return false and keep canonical order untouched', () => {
		const verts = square(false).map(dp => {
			const v = new RenderVertex()
			v.x = dp.vertex.x
			v.y = dp.vertex.y
			return v
		})
		expect(normalizeWindingOrder(verts)).to.equal(false)
		expect(verts.map(v => [v.x, v.y])).to.deep.equal([
			[0, 0],
			[0, 100],
			[100, 100],
			[100, 0],
		])
	})

	it('should reverse clockwise outlines and shift slingshot flags with the edges', () => {
		const verts = square(true).map((dp, i) => {
			const v = new RenderVertex()
			v.x = dp.vertex.x
			v.y = dp.vertex.y
			v.fSlingshot = i === 0
			return v
		})
		expect(normalizeWindingOrder(verts)).to.equal(true)
		expect(verts.map(v => [v.x, v.y])).to.deep.equal([
			[0, 100],
			[100, 100],
			[100, 0],
			[0, 0],
		])
		// The authored sling edge (0,0)->(100,0) now runs (100,0)->(0,0) at index 2.
		expect(verts.map(v => v.fSlingshot)).to.deep.equal([false, false, true, false])
	})

	it('should emit outward-facing segments for canonical outlines', () => {
		expect(bottomEdgeNormals(false)).to.deep.equal([[0, -1]])
	})

	it('should collide both ways for reversed outlines', () => {
		const normals = bottomEdgeNormals(true)
		expect(normals).to.have.lengthOf(2)
		expect(normals).to.deep.include([0, -1])
		expect(normals).to.deep.include([0, 1])
	})

	it('should keep the slingshot mesh on the authored direction when reversed', () => {
		const table = new TableBuilder().addSurface('wall', { dragPoints: square(true, 0) }).build()
		new Player(table).init()
		const wall = table.surfaces.wall
		const slings = wall.getHitShapes().filter((hit): hit is LineSegSlingshot => hit instanceof LineSegSlingshot)
		expect(slings).to.have.lengthOf(2)
		wall.getApi().PlaySlingshotHit()
		expect(slings.filter(s => s.doHitEvent)).to.have.lengthOf(1)
	})
})
