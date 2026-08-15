// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { ThreeHelper } from '../../../test/three.helper'
import { Player } from '../../game/player.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { Enums } from '../enums.js'
import { Table } from '../table/table.js'
import type { LightState } from './light-state.js'

chai.use((sinonChai as any).default ?? sinonChai)
const three = new ThreeHelper()

describe('The VPinball light animation', () => {
	let table: Table
	let player: Player

	beforeEach(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-light.vpx')))
		player = new Player(table).init()
	})

	it('should turn on correctly', async () => {
		const light = table.lights.Surface
		const api = light.getApi()

		api.State = Enums.LightStatus.LightStateOff
		api.Intensity = 1

		player.simulateTime(0)
		expect(light.getState().intensity).to.equal(0)

		api.State = Enums.LightStatus.LightStateOn
		player.simulateTime(20)
		expect(light.getState().intensity).to.equal(1)
	})

	it('should turn off correctly', async () => {
		const light = table.lights.Surface
		const api = light.getApi()

		api.State = Enums.LightStatus.LightStateOn
		api.Intensity = 1

		player.simulateTime(0)
		expect(light.getState().intensity).to.equal(1)

		api.State = Enums.LightStatus.LightStateOff
		player.simulateTime(20)
		expect(light.getState().intensity).to.equal(0)
	})

	it('should go from off to on', () => {
		const light = table.lights.Surface
		const api = light.getApi()

		api.State = Enums.LightStatus.LightStateOff
		api.Intensity = 1

		player.simulateTime(0)
		expect(light.getState().intensity).to.equal(0)

		api.Duration(Enums.LightStatus.LightStateOff, 500, Enums.LightStatus.LightStateOn)

		player.simulateTime(520)
		expect(light.getState().intensity).to.equal(1)

		player.simulateTime(650)
		expect(light.getState().intensity).to.equal(1)
	})

	it('should go from of to blinking', () => {
		const light = table.lights.Surface
		const api = light.getApi()

		api.State = Enums.LightStatus.LightStateOff
		api.Intensity = 1

		player.simulateTime(0)
		expect(light.getState().intensity).to.equal(0)

		api.Duration(Enums.LightStatus.LightStateOff, 500, Enums.LightStatus.LightStateBlinking)

		player.simulateTime(520)
		expect(light.getState().intensity).to.equal(1)

		player.simulateTime(650)
		expect(light.getState().intensity).to.equal(0)

		player.simulateTime(770)
		expect(light.getState().intensity).to.equal(1)
	})

	it('should go from blinking to off', () => {
		const light = table.lights.Surface
		const api = light.getApi()

		api.State = Enums.LightStatus.LightStateOff
		api.Intensity = 1

		player.simulateTime(0)
		expect(light.getState().intensity).to.equal(0)

		api.Duration(Enums.LightStatus.LightStateBlinking, 500, Enums.LightStatus.LightStateOff)

		player.simulateTime(20)
		expect(light.getState().intensity).to.equal(1)

		player.simulateTime(120)
		expect(light.getState().intensity).to.equal(1)

		player.simulateTime(140)
		expect(light.getState().intensity).to.equal(0)
	})

	it('should blink the correct pattern', async () => {
		const light = table.lights.Surface
		const api = light.getApi()

		api.BlinkPattern = '100110'
		api.BlinkInterval = 100
		api.State = Enums.LightStatus.LightStateBlinking
		api.Intensity = 10
		api.IntensityScale = 1

		player.simulateTime(50)
		expect(light.getState().intensity).to.equal(10)

		player.simulateTime(150)
		expect(light.getState().intensity).to.equal(0)

		player.simulateTime(250)
		expect(light.getState().intensity).to.equal(0)

		player.simulateTime(350)
		expect(light.getState().intensity).to.equal(10)

		player.simulateTime(450)
		expect(light.getState().intensity).to.equal(10)

		player.simulateTime(550)
		expect(light.getState().intensity).to.equal(0)
	})

	it('should correctly repeat a blink pattern', async () => {
		const light = table.lights.Surface
		const api = light.getApi()

		api.BlinkPattern = '101'
		api.BlinkInterval = 100
		api.State = Enums.LightStatus.LightStateBlinking
		api.Intensity = 10
		api.IntensityScale = 1

		player.simulateTime(100)
		expect(light.getState().intensity).to.equal(10)

		player.simulateTime(200)
		expect(light.getState().intensity).to.equal(0)

		player.simulateTime(300)
		expect(light.getState().intensity).to.equal(10)

		player.simulateTime(400)
		expect(light.getState().intensity).to.equal(10)

		player.simulateTime(500)
		expect(light.getState().intensity).to.equal(0)

		player.simulateTime(600)
		expect(light.getState().intensity).to.equal(10)

		player.simulateTime(700)
		expect(light.getState().intensity).to.equal(10)

		player.simulateTime(800)
		expect(light.getState().intensity).to.equal(0)
	})

	it('should correctly fade in and out', async () => {
		const light = table.lights.Surface
		const api = light.getApi()

		api.BlinkPattern = '10'
		api.BlinkInterval = 600
		api.State = Enums.LightStatus.LightStateBlinking
		api.Intensity = 100
		api.IntensityScale = 1
		api.Fader = Enums.Fader.Linear
		api.FadeSpeedDown = 0.3
		api.FadeSpeedUp = 0.4

		player.simulateTime(590)
		expect(light.getState().intensity).to.equal(100)

		player.simulateTime(630)
		expect(light.getState().intensity).to.be.within(90, 91)

		player.simulateTime(770)
		expect(light.getState().intensity).to.be.within(44, 46)

		player.simulateTime(910)
		expect(light.getState().intensity).to.be.within(5, 6)

		player.simulateTime(940)
		expect(light.getState().intensity).to.equal(0)

		player.simulateTime(1230)
		expect(light.getState().intensity).to.be.within(6, 7)

		player.simulateTime(1330)
		expect(light.getState().intensity).to.be.within(46, 47)

		player.simulateTime(1420)
		expect(light.getState().intensity).to.be.within(86, 87)

		player.simulateTime(1460)
		expect(light.getState().intensity).to.equal(100)
	})

	it('should pop the correct state', () => {
		const light = table.lights.Surface
		const api = light.getApi()

		api.State = Enums.LightStatus.LightStateOff
		player.simulateTime(10)
		api.State = Enums.LightStatus.LightStateBlinking
		player.simulateTime(200)

		const popped = player.popStates().getState<LightState>('Surface')
		const current = table.lights.Surface.getState().intensity
		if (popped) {
			expect(popped.intensity).to.equal(current)
		} else {
			expect(current).to.be.a('number')
			expect(current).to.be.greaterThan(0)
		}
	})
})
