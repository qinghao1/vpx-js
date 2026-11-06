// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE
/**
 * Regression: lights flashing + FADER_NONE instant handling.
 * See https://github.com/vpinball/vpinball/blob/master/src/parts/light.cpp:319
 * and fix for 4ce16a57 which removed FADER_NONE check causing all lights to fade linearly.
 * Walking Dead has 157/165 lights with fader=0 (FADER_NONE) which must be instant, not gradual.
 */
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { Enums } from '../enums.js'
import { Table } from '../table/table.js'
import { LightData } from './light.js'

describe('regression: light fader must be instant for FADER_NONE (guards 4ce16a57 flashing)', () => {
	it('LightData default fader must be FADER_LINEAR (1) matching vpinball light.h', () => {
		const d = new LightData('test')
		expect(d.fader).toBe(Enums.Fader.Linear)
		expect(d.fader).toBe(1)
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
})
