// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { type Mesh, Vector3 } from 'three'
import { createBall } from '../../../test/physics.helper'
import { ThreeHelper } from '../../../test/three.helper'
import { Player } from '../../game/player.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { ThreeRenderApi } from '../../render/threejs/three-render-api.js'
import { Table } from '../table/table.js'
import { TableExporter } from '../table/table-exporter.js'

chai.use((sinonChai as any).default ?? sinonChai)
const three = new ThreeHelper()
const renderApi = new ThreeRenderApi()

describe('The VPinball ball physics', () => {
	let table: Table
	let exporter: TableExporter
	let player: Player

	before(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-empty.vpx')))
		exporter = new TableExporter(table)
	})

	beforeEach(() => {
		player = new Player(table).init()
	})

	it('should add the ball to the right position', async () => {
		const ball = createBall(player, 500, 500, 500)

		expect(ball.getState().pos.x).to.equal(500)
		expect(ball.getState().pos.y).to.equal(500)
		expect(ball.getState().pos.z).to.equal(525) // radius gets added
	})

	it('should let the ball fall down to the playfield', async () => {
		const ball = createBall(player, 500, 500, 500)

		player.updatePhysics(0)
		player.updatePhysics(250)

		expect(ball.getState().pos.x).to.equal(500)
		expect(ball.getState().pos.y).to.be.above(500) // physical slope is even, gravity isn't instead, so the ball hits a bit lower than initially set.
		expect(ball.getState().pos.z).to.be.below(50) // ball nearly reached the playfield
	})

	it('should let the ball roll down on the playfield', async () => {
		const ball = createBall(player, 500, 500, 0)

		// assert initial orientation
		expect(ball.getState().orientation.matrix[1][1]).to.equal(1)
		expect(ball.getState().orientation.matrix[1][2]).to.equal(0)
		expect(ball.getState().orientation.matrix[2][1]).to.equal(0)
		expect(ball.getState().orientation.matrix[2][2]).to.equal(1)

		player.updatePhysics(0)
		player.updatePhysics(1000)

		// ball has rolled now
		expect(ball.getState().orientation.matrix[1][1]).to.not.equal(1)
		expect(ball.getState().orientation.matrix[1][2]).to.not.equal(0)
		expect(ball.getState().orientation.matrix[2][1]).to.not.equal(0)
		expect(ball.getState().orientation.matrix[2][2]).to.not.equal(1)

		// and moved downwards
		expect(ball.getState().pos.y).to.be.above(550)
	})

	it('should let the ball move to the right direction with velocity', async () => {
		const ball = createBall(player, 500, 500, 500, 10)

		// assert initial position with velocity
		expect(ball.getState().pos.x).to.equal(500)
		expect(ball.getState().pos.y).to.equal(500)
		expect(ball.getState().pos.z).to.equal(525) // radius gets added

		player.updatePhysics(0)
		player.updatePhysics(250)

		expect(ball.getState().pos.x).to.be.above(700) // moves this time
		expect(ball.getState().pos.y).to.be.above(500)
		expect(ball.getState().pos.z).to.be.below(50)
	})

	it('should apply the mesh transformation', async () => {
		// create scene
		const gltf = await three.loadGlb(await exporter.exportGlb())

		// add ball
		const ball = createBall(player, 500, 500, 0, 0, 10)
		await ball.addToScene(gltf.scene as any, renderApi, table) // fixme type
		const ballObj = three.find<Mesh>(gltf, 'balls', ball.getName())

		// init vectors
		const startPos = new Vector3()
		const endPos = new Vector3()

		// position ball
		player.updatePhysics(0)
		ball.getUpdater().applyState(ballObj, ball.getState(), renderApi, table)
		ballObj.getWorldPosition(startPos)

		// let ball roll some
		player.updatePhysics(100)
		ball.getUpdater().applyState(ballObj, ball.getState(), renderApi, table)
		ballObj.getWorldPosition(endPos)

		expect(ball.getState().pos.y).to.be.above(500)
		expect(endPos.distanceTo(startPos)).to.be.above(0.05)
	})

	it('should remove a ball from the scene', async () => {
		// create scene
		const gltf = await three.loadGlb(await exporter.exportGlb())

		// add ball
		const ball = createBall(player, 500, 500, 0, 0, 10)
		await ball.addToScene(gltf.scene as any, renderApi, table) // fixme type

		// assert it's in the scene
		three.expectObject(gltf, 'balls', ball.getName())

		// destroy ball
		player.destroyBall(ball)
		ball.removeFromScene(gltf.scene as any, renderApi) // fixme type

		// assert it's gone
		three.expectNoObject(gltf, 'balls', ball.getName())
	})
})
