// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { TableBuilder } from '../../../test/table-builder.js'
import { ThreeHelper } from '../../../test/three.helper'
import { EventProxy } from '../../game/event-proxy.js'
import { Player } from '../../game/player.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { HitTriangle } from '../../physics/hit-triangle.js'
import { Table } from '../table/table.js'
import { RubberHitGenerator } from './rubber-physics.js'

chai.use((sinonChai as any).default ?? sinonChai)
const three = new ThreeHelper()

describe('The VPinball rubber collision', () => {
	let table: Table
	let player: Player

	before(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-rubber.vpx')))
	})

	beforeEach(() => {
		player = new Player(table).init()
	})

	it('should make the ball bounce off', () => {
		const kicker = table.kickers.BallRelease.getApi()

		// create ball
		const ball = kicker.CreateBall()
		kicker.Kick(-45, -5)

		// let it roll down some
		player.updatePhysics(0)
		player.updatePhysics(700)

		// assert it's moving down right
		expect(ball.getState().pos.x).to.be.above(400)
		expect(ball.getState().pos.y).to.be.above(400)

		// let it hit and bounce back
		player.updatePhysics(1200)

		// assert it bounced back (allow 1px tolerance for primitive sides default)
		expect(ball.getState().pos.x).to.be.below(401)
		expect(ball.getState().pos.y).to.be.below(401)
	})
})

describe('The VPinball rubber degenerate triangles', () => {
	it('should skip degenerate triangles but keep healthy ones, like upstream PhysicSetup', () => {
		const table = new TableBuilder().addRubber('r1', { height: 50, hitHeight: 25 }).build()
		const rubber = table.rubbers.r1
		const generator = new RubberHitGenerator(rubber.data, {
			getMeshes: () => ({
				vertices: [
					{ x: 0, y: 0, z: 0 },
					{ x: 0, y: 0, z: 0 },
					{ x: 1, y: 0, z: 0 },
					{ x: 0, y: 1, z: 5 },
				],
				indices: [0, 1, 2, 0, 2, 3],
			}),
		} as any)
		const hits = generator.generateHitObjects(new EventProxy(rubber), table)
		// First triangle reuses vertex 0 twice (zero normal) and must be dropped;
		// the second one is healthy. Edges and points are still emitted.
		const tris = hits.filter(h => h instanceof HitTriangle)
		expect(tris.length).to.equal(1)
		expect(hits.length).to.be.above(1)
	})
})

describe('The VPinball rubber hit height', () => {
	it('should bake hit shapes at hit height, not visual height', () => {
		const table = new TableBuilder().addRubber('r1', { height: 50, hitHeight: 25 }).build()
		new Player(table).init()
		const tris = table.rubbers.r1.getHitShapes().filter(h => h instanceof HitTriangle) as HitTriangle[]
		expect(tris.length).to.be.above(0)
		let minZ = Infinity
		let maxZ = -Infinity
		for (const tri of tris) {
			for (const v of tri.rgv) {
				minZ = Math.min(minZ, v.z)
				maxZ = Math.max(maxZ, v.z)
			}
		}
		expect((minZ + maxZ) / 2).to.be.closeTo(25, 0.5)
	})
})
