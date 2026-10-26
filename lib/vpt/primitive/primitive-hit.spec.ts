// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { ThreeHelper } from '../../../test/three.helper'
import type { EventProxy } from '../../game/event-proxy.js'
import { Player } from '../../game/player.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { Vertex3DNoTex2 } from '../../util/vertex.js'
import { Mesh } from '../mesh.js'
import { Table } from '../table/table.js'
import { PrimitiveData } from './primitive-data.js'
import { PrimitiveHitGenerator } from './primitive-hit-generator.js'

chai.use((sinonChai as any).default ?? sinonChai)
const three = new ThreeHelper()

describe('The VPinball primitive collision', () => {
	let table: Table
	let player: Player

	before(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-primitive.vpx')))
	})

	beforeEach(() => {
		player = new Player(table).init()
	})

	it('with a simple primitive make the ball bounce back on collision', () => {
		// create ball
		const kicker = table.kickers.BallRelease.getApi()
		const ball = kicker.CreateBall()
		kicker.Kick(0, -10)

		// let it roll down some
		player.updatePhysics(0)
		player.updatePhysics(100)

		// assert it's moving down
		expect(ball.getState().pos.y).to.be.above(1190)

		// let it hit and bounce back
		player.updatePhysics(550)

		// assert it bounced back
		// FIX_PHYSICS: 1190.85 (was 1188.73), same margin.
		expect(ball.getState().pos.y).to.be.below(1192)
	})

	it('with a 3D primitive make the ball bounce back on collision', { timeout: 30000 }, async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-sink.vpx')))
		player = new Player(table).init()
		const kicker = table.kickers.BallRelease.getApi()

		// create ball
		const ball = kicker.CreateBall()
		kicker.Kick(-45, 4.5)

		// assert initial position
		expect(ball.getState().pos.x).to.equal(600)
		expect(ball.getState().pos.y).to.equal(1250)
		expect(ball.getState().pos.z).to.equal(25)

		// let it roll up left to the sink
		player.updatePhysics(0)
		player.updatePhysics(350)

		// assert it's moving up left
		expect(ball.getState().pos.x).to.be.below(520)
		expect(ball.getState().pos.y).to.be.below(1175)

		// let it collide and roll back to kicker
		player.updatePhysics(1500)

		// assert it's on its way back
		expect(ball.getState().pos.x).to.be.above(520)
		expect(ball.getState().pos.y).to.be.above(1140)

		// after some time it rolls further back
		player.updatePhysics(2100)
		expect(ball.getState().pos.x).to.be.above(545)
		expect(ball.getState().pos.y).to.be.above(1190)
	})

	it('should detect the playfield mesh regardless of case', () => {
		for (const name of ['playfield_mesh', 'Playfield_Mesh', 'PLAYFIELD_MESH']) {
			const data = new PrimitiveData('Primitive0', false)
			data.name = name
			new PrimitiveHitGenerator(data).generateHitObjects(new Mesh(), {} as EventProxy, {} as Table)
			expect(data.useAsPlayfield, name).to.equal(true)
			expect(data.isVisible, name).to.equal(false)
		}
	})

	it('should generate no hit objects for a toy primitive', () => {
		const data = new PrimitiveData('Primitive0', false)
		data.name = 'Toy'
		data.isToy = true
		const hits = new PrimitiveHitGenerator(data).generateHitObjects(
			singleTriangleMesh(),
			{} as EventProxy,
			{} as Table,
		)
		expect(hits).to.have.lengthOf(0)
	})

	it('should apply table physics to the playfield mesh and honor its collidable flag', () => {
		const table = {
			data: { elasticity: 0.5, elasticityFalloff: 1, friction: 0.2, scatter: 7 },
		} as unknown as Table
		for (const isCollidable of [true, false]) {
			const data = new PrimitiveData('Primitive0', false)
			data.name = 'playfield_mesh'
			data.isCollidable = isCollidable
			const hits = new PrimitiveHitGenerator(data).generateHitObjects(
				singleTriangleMesh(),
				{} as EventProxy,
				table,
			)
			expect(hits.length).to.be.greaterThan(0)
			for (const hit of hits) {
				expect(hit.isEnabled, `isCollidable=${isCollidable}`).to.equal(isCollidable)
				expect(hit.elasticity).to.be.closeTo(0.5, 1e-9)
				expect(hit.friction).to.be.closeTo(0.2, 1e-9)
			}
		}
	})
})

function singleTriangleMesh(): Mesh {
	return new Mesh(
		[
			Vertex3DNoTex2.fromArray([0, 0, 0, 0, 0, 1, 0, 0]),
			Vertex3DNoTex2.fromArray([10, 0, 0, 0, 0, 1, 0, 0]),
			Vertex3DNoTex2.fromArray([0, 10, 0, 0, 0, 1, 0, 0]),
		],
		[0, 1, 2],
	)
}
