// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import type { Mesh } from 'three'
import { createBall } from '../../../test/physics.helper'
import { ThreeHelper } from '../../../test/three.helper'
import { Player } from '../../game/player.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { ThreeRenderApi } from '../../render/threejs/three-render-api.js'
import { Table } from '../table/table.js'
import { TableExporter } from '../table/table-exporter.js'
import type { BumperState } from './bumper-state.js'

chai.use((sinonChai as any).default ?? sinonChai)
const three = new ThreeHelper()
const renderApi = new ThreeRenderApi()

describe('The VPinball bumper collision', () => {
	let table: Table
	let exporter: TableExporter
	let player: Player

	beforeEach(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-bumper.vpx')))
		exporter = new TableExporter(table)
		player = new Player(table).init()
	})

	it('should eject the ball when hit threshold has passed', () => {
		// put ball on top of flipper face
		const ball = createBall(player, 450, 750, 50, 0, 1)

		expect(ball.getState().pos.x).to.equal(450)

		player.simulateTime(500)
		expect(ball.getState().pos.x).to.equal(450)

		player.simulateTime(1100)
		expect(ball.getState().pos.x).to.be.within(75, 85)
		expect(ball.getState().pos.y).to.be.below(600)
	})

	it('should just collide when hitting under the threshold limit', () => {
		const ball = createBall(player, 450, 750, 50, 0, 0.5)
		expect(ball.getState().pos.x).to.equal(450)

		player.simulateTime(500)
		expect(ball.getState().pos.x).to.equal(450)

		player.simulateTime(1100)
		expect(ball.getState().pos.x).to.be.within(430, 440)
		expect(ball.getState().pos.y).to.be.above(800)
	})

	it('should animate the ring when hit', () => {
		createBall(player, 450, 750, 50, 0, 1)
		const bumper = table.bumpers.Bumper2

		player.simulateTime(10)
		expect(bumper.getState().ringOffset).to.equal(0)
		player.simulateTime(700)
		expect(bumper.getState().ringOffset).to.be.closeTo(-8.33, 0.01)
		player.simulateTime(780)
		expect(bumper.getState().ringOffset).to.be.closeTo(-41.66, 0.01)
		player.simulateTime(840)
		expect(bumper.getState().ringOffset).to.be.closeTo(-20, 0.01)
		player.simulateTime(900)
		expect(bumper.getState().ringOffset).to.equal(0)
	})

	it('should apply the ring transformation to the object', async () => {
		// create scene
		const gltf = await three.loadGlb(await exporter.exportGlb())

		// add ball
		createBall(player, 450, 750, 50, 0, 1)
		const bumper = table.bumpers.Bumper2
		const bumperObj = three.find<Mesh>(gltf, 'bumpers', 'Bumper2')
		const ringObj = bumperObj.children.find(o => o.name === `bumper-ring-Bumper2`)!

		player.simulateTime(710)
		let states = player.popStates()
		let state = states.getState<BumperState>('Bumper2')
		bumper.getUpdater().applyState(bumperObj, state, renderApi, table)
		expect(ringObj.position.z).to.be.closeTo(8.33, 0.01)

		player.simulateTime(770)
		states = player.popStates()
		state = states.getState<BumperState>('Bumper2')
		bumper.getUpdater().applyState(bumperObj, state, renderApi, table)
		expect(ringObj.position.z).to.be.closeTo(41.66, 0.5)
	})
})
