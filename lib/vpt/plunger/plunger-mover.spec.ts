// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import type { Mesh, Object3D } from 'three'
import { ThreeHelper } from '../../../test/three.helper'
import { Player } from '../../game/player.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { ThreeRenderApi } from '../../render/threejs/three-render-api.js'
import { Table } from '../table/table.js'
import type { PlungerMover } from './plunger-mover.js'
import type { PlungerState } from './plunger-state.js'

chai.use((sinonChai as any).default ?? sinonChai)
const three = new ThreeHelper()
const renderApi = new ThreeRenderApi()

describe('The VPinball plunger physics', () => {
	let table: Table
	let player: Player

	before(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-plunger.vpx')))
	})

	beforeEach(() => {
		player = new Player(table).init()
		player.simulateTime(50) // move to start position
	})

	it('should be in the correct initial state', async () => {
		const plunger = table.plungers.CustomPlunger!
		const plungerMover = plunger.getMover() as PlungerMover

		// Park frame for the default park position: an unfired manual plunger
		// holds park instead of creeping to the frame end (upstream only
		// springs toward a mech sensor — hitplunger.cpp `else if (isMech)`).
		const parkFrame = Math.floor((1 - 0.5 / 3) * (plungerMover.cFrames - 1) + 0.5)
		const parkPos = plungerMover.frameEnd + (0.5 / 3) * (plungerMover.frameStart - plungerMover.frameEnd)

		// Live state: with no motion, popStates() reports no diff.
		expect(plunger.getState().frame).to.equal(parkFrame)
		expect(plungerMover.pos).to.be.closeTo(parkPos, 1e-3)
	})

	it('should hold the park position while unfired', async () => {
		const plunger = table.plungers.CustomPlunger
		const plungerMover = plunger.getMover() as PlungerMover
		const pos = plungerMover.pos
		const frame = plunger.getState().frame

		player.simulateTime(2000)

		expect(plungerMover.pos).to.equal(pos)
		expect(plunger.getState().frame).to.equal(frame)
	})

	it('should stop a normal pull at the park position', async () => {
		const plunger = table.plungers.CustomPlunger
		const plungerMover = plunger.getMover() as PlungerMover
		const minPos =
			plungerMover.frameEnd + plunger.data.parkPosition * (plungerMover.frameStart - plungerMover.frameEnd)

		plunger.pullBack()
		// Tip below park with a pull in effect (e.g. a pull overlapping a
		// recent fire): upstream clamps back up to the park position.
		plungerMover.pos = plungerMover.frameEnd
		plungerMover.speed = 0
		plungerMover.updateVelocities()

		expect(plungerMover.pos).to.be.closeTo(minPos, 1e-9)
		expect(plungerMover.speed).to.equal(0)
	})

	it('should move to the end when pulled back', async () => {
		const plunger = table.plungers.CustomPlunger
		const plungerMover = plunger.getMover() as PlungerMover
		const endPosition = plunger.getApi().Y

		plunger.pullBack()
		player.simulateTime(1000)

		const plungerState = popState(player, 'CustomPlunger')
		expect(plungerState.frame).to.equal(0)
		expect(plungerMover.pos).to.equal(endPosition)
	})

	it('should move back after being fired', async () => {
		const plunger = table.plungers.CustomPlunger

		plunger.pullBack()
		player.simulateTime(50)
		plunger.fire()
		player.simulateTime(500)

		// The fire bounce decays around the park position; with no mech
		// sensor there is no idle spring pulling past it to the frame end.
		expect(plunger.getState().frame).to.equal(21)
	})

	it('should fire LimitBOS when pulled back and LimitEOS when fired', async () => {
		const plunger = table.plungers.CustomPlunger
		const api = plunger.getApi()
		let bosCount = 0
		let eosCount = 0
		api.on('LimitBOS', () => bosCount++)
		api.on('LimitEOS', () => eosCount++)

		plunger.pullBack()
		player.simulateTime(1000)
		expect(bosCount).to.be.greaterThan(0)
		expect(eosCount).to.equal(0)

		plunger.fire()
		player.simulateTime(2000)
		expect(eosCount).to.be.greaterThan(0)
	})

	it('should stay parked when fired without a pull', async () => {
		// A keyboard fire from the park position releases nothing (dx = 0):
		// without a pull there is no launch, and with no mech sensor there is
		// no idle spring to drift on (hitplunger.cpp `else if (isMech)`).
		const plunger = table.plungers.CustomPlunger
		const plungerState = plunger.getState()

		plunger.fire()

		player.updatePhysics(50)
		expect(plungerState.frame).to.equal(21)

		player.updatePhysics(300)
		expect(plunger.getState().frame).to.equal(21)
	})

	it('should fire fully when auto-fire is enabled', async () => {
		const plunger = table.plungers.AutoPlunger

		plunger.fire()

		const plungerState = popState(player, 'AutoPlunger')
		expect(plungerState.frame).to.equal(0)
	})

	it('should apply the mesh transformation when animated', async () => {
		// create scene
		const node: Object3D = await table.generateTableNode(new ThreeRenderApi(), {})
		const plunger = table.plungers.CustomPlunger

		// retrieve plunger
		const plungerObj = three.find<Mesh>(node, 'plungers', 'CustomPlunger')
		const rodObj = plungerObj.children.find(c => c.name === 'rod') as Mesh
		const springObj = plungerObj.children.find(c => c.name === 'spring') as Mesh

		// apply player state to plunger
		plunger.getUpdater().applyState(plungerObj, plunger.getState(), renderApi, table)
		rodObj.geometry.computeBoundingBox()
		springObj.geometry.computeBoundingBox()

		// get bounding boxes to compare with
		const rodY = rodObj.geometry.boundingBox.min.y
		const springY = rodObj.geometry.boundingBox.min.y

		// pull plunger
		plunger.pullBack()
		player.updatePhysics(200)

		// apply again
		plunger.getUpdater().applyState(plungerObj, plunger.getState(), renderApi, table)
		rodObj.geometry.computeBoundingBox()
		springObj.geometry.computeBoundingBox()

		// assert it's bigger now
		expect(rodObj.geometry.boundingBox.min.y).to.be.above(rodY)
		expect(springObj.geometry.boundingBox.min.y).to.be.above(springY)
	})
})

function popState(player: Player, name: string): PlungerState {
	const states = player.popStates()
	return states.getState<PlungerState>(name)
}
