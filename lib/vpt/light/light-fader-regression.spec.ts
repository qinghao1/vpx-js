// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE
/**
 * Regression: lights flashing + FADER_NONE instant handling.
 * See https://github.com/vpinball/vpinball/blob/master/src/parts/light.cpp:319
 * and fix for 4ce16a57 which removed FADER_NONE check causing all lights to fade linearly.
 * Walking Dead has 157/165 lights with fader=0 (FADER_NONE) which must be instant, not gradual.
 */
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ThreeHelper } from '../../../test/three.helper.js'
import { Player } from '../../game/player.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { Enums } from '../enums.js'
import { Table } from '../table/table.js'
import { LightData } from './light.js'

const three = new ThreeHelper()

describe('regression: light fader must be instant for FADER_NONE (guards 4ce16a57 flashing)', () => {
	it('LightData default fader must be FADER_LINEAR (1) matching vpinball light.h', () => {
		const d = new LightData('test')
		expect(d.fader).toBe(Enums.Fader.Linear)
		expect(d.fader).toBe(1)
	})

	it('FADER_NONE must be instant - walking_dead flashing regression', async () => {
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-light.vpx')))
		const player = new Player(table).init()
		const light = table.lights.Surface
		const api = light.getApi()

		api.BlinkPattern = '10'
		api.BlinkInterval = 600
		api.State = Enums.LightStatus.LightStateBlinking
		api.Intensity = 100
		api.IntensityScale = 1
		api.FadeSpeedDown = 0.3
		api.FadeSpeedUp = 0.4
		api.Fader = Enums.Fader.None

		player.simulateTime(590)
		expect(light.getState().intensity, '590 should be on').toBe(100)

		player.simulateTime(630)
		expect(light.getState().intensity, '630 with FADER_NONE must be instant 0, not faded ~90').toBe(0)

		player.simulateTime(770)
		expect(light.getState().intensity).toBe(0)

		player.simulateTime(1230)
		expect(light.getState().intensity, '1230 back on with instant').toBe(100)
	})

	it.skipIf(!existsSync('walking_dead.vpx'))(
		'walking_dead fixture must have majority fader NONE (guard against wrong default)',
		async () => {
			const table = await Table.load(new NodeBinaryReader('walking_dead.vpx'))
			const lights = Object.values(table.lights)
			const none = lights.filter(l => (l.data.fader ?? 0) === 0).length
			const linear = lights.filter(l => l.data.fader === 1).length
			expect(lights.length).toBeGreaterThan(100)
			expect(none, 'walking_dead should be mostly FADER_NONE').toBeGreaterThan(100)
			// 157 NONE / 8 LINEAR observed - ensures fixtures not all forced to linear
			expect(linear).toBeGreaterThan(0)
		},
	)

	it('FADER_INCANDESCENT must warm up and cool down like a filament, not ramp linearly', async () => {
		// Upstream simulates tungsten filament warm-up/cool-down for fader=2
		// (Light::UpdateAnimation FADER_INCANDESCENT + src/utils/bulb.cpp): emission
		// stays ~0 until the filament heats past ~1500K and sheds heat fast from
		// full temperature, so neither slope matches the linear ramp.
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-light.vpx')))
		const player = new Player(table).init()
		const light = table.lights.Surface
		const api = light.getApi()

		api.Fader = Enums.Fader.Incandescent
		api.State = Enums.LightStatus.LightStateOff
		api.Intensity = 100
		api.IntensityScale = 1
		api.FadeSpeedUp = 0.4
		api.FadeSpeedDown = 0.3

		player.simulateTime(3000)
		expect(light.getState().intensity, 'filament cooled dark').toBe(0)

		api.State = Enums.LightStatus.LightStateOn
		player.simulateTime(3050)
		expect(light.getState().intensity, 'filament still heating at +50ms (linear gives 20)').toBeGreaterThan(0)
		expect(light.getState().intensity).toBeLessThan(5)

		player.simulateTime(4500)
		expect(light.getState().intensity, 'filament reaches full brightness').toBeGreaterThan(95)
		expect(light.getState().intensity).toBeLessThanOrEqual(100)

		api.State = Enums.LightStatus.LightStateOff
		player.simulateTime(4550)
		expect(light.getState().intensity, 'filament sheds heat fast (linear gives ~85)').toBeGreaterThan(45)
		expect(light.getState().intensity).toBeLessThan(75)
	})

	it('invisible lights must keep animating (visibility gates rendering only)', async () => {
		// Upstream Light::UpdateAnimation has no m_visible check; visibility only gates
		// the bulb/lightmap render passes (src/parts/light.cpp:461,553,603). An early
		// return here would freeze fades/blinks and desync timeMsec while hidden.
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-light.vpx')))
		const player = new Player(table).init()
		const light = table.lights.Surface
		const api = light.getApi()
		api.Visible = false
		api.Fader = Enums.Fader.None
		api.State = Enums.LightStatus.LightStateOff
		api.Intensity = 100
		player.simulateTime(100)
		expect(light.getState().intensity).toBe(0)
		api.State = Enums.LightStatus.LightStateOn
		player.simulateTime(200)
		expect(light.getState().intensity).toBe(100)
	})
})
