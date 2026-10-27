// Behavior specs for the light bake/modulation fixes.
// Each `fails-before` case documents the pre-fix value it asserted against.

import { describe, expect, it } from 'vitest'
import { Vertex2D, Vertex3D } from '../../math/vector.js'
import { DragPoint } from '../dragpoint.js'
import { Enums } from '../enums.js'
import { Light, LightData } from './light.js'
import { bakedIntensity } from './light-physics.js'

function mkData(over: Partial<LightData> = {}): LightData {
	const d = new LightData('L1')
	d.center = new Vertex2D(500, 1000)
	Object.assign(d, over)
	return d
}

function glowData(over: Partial<LightData> = {}): LightData {
	const d = mkData({ bulbLight: true, ...over })
	for (const [x, y] of [
		[450, 950],
		[550, 950],
		[550, 1050],
		[450, 1050],
	]) {
		const p = new DragPoint()
		p.vertex = new Vertex3D(x, y, 0)
		d.dragPoints.push(p)
	}
	return d
}

const stubTable: any = {
	getSurfaceHeight: () => 0,
	getScaleZ: () => 1,
	getTexture: () => undefined,
	getDetailLevel: () => 1,
	getMaterial: () => undefined,
}

describe('bakedIntensity', () => {
	it('scales linearly with fractional states', () => {
		expect(bakedIntensity(mkData({ state: 0.5, intensity: 10 }))).toBe(5)
		expect(bakedIntensity(mkData({ state: 0, intensity: 10 }))).toBe(0)
		expect(bakedIntensity(mkData({ state: 1, intensity: 10 }))).toBe(10)
	})

	it('starts blinking on the first pattern frame', () => {
		expect(bakedIntensity(mkData({ state: 2, intensity: 10, rgBlinkPattern: '1' }))).toBe(10)
		expect(bakedIntensity(mkData({ state: 2, intensity: 10, rgBlinkPattern: '0' }))).toBe(0)
		// Later frames do not matter at bake time; only frame 0 resolves.
		expect(bakedIntensity(mkData({ state: 2, intensity: 10, rgBlinkPattern: '01' }))).toBe(0)
		expect(bakedIntensity(mkData({ state: 2, intensity: 10, rgBlinkPattern: '10' }))).toBe(10)
	})

	it('clamps legacy states like upstream clampLightState', () => {
		expect(bakedIntensity(mkData({ state: -1, intensity: 10 }))).toBe(10)
		expect(bakedIntensity(mkData({ state: 255, intensity: 10 }))).toBe(10)
		expect(bakedIntensity(mkData({ state: 7, intensity: 10 }))).toBe(10)
	})
})

describe('light bake sites agree', () => {
	it('seeds the ctor state from the baked level', () => {
		expect(new Light(mkData({ state: 0.5, intensity: 10 })).getState().intensity).toBe(5)
		expect(new Light(mkData({ state: 2, intensity: 10, rgBlinkPattern: '01' })).getState().intensity).toBe(0)
		expect(new Light(mkData({ state: Enums.LightStatus.LightStateOn, intensity: 4 })).getState().intensity).toBe(4)
	})

	it('bakes the glow params from the baked level, not isOn()', () => {
		const mockApi: any = { createBulbGlowGeometry: () => ({}) }
		// Fractional: the old isOn() gate baked 0 while the ctor baked 5.
		const frac = new Light(glowData({ state: 0.5, intensity: 10 })).getMeshes(stubTable, mockApi)
		expect(frac.glow?.bulbGlow?.intensity).toBe(5)
		const blinkOff = new Light(glowData({ state: 2, intensity: 10, rgBlinkPattern: '01' })).getMeshes(
			stubTable,
			mockApi,
		)
		expect(blinkOff.glow?.bulbGlow?.intensity).toBe(0)
		const on = new Light(glowData({ state: 1, intensity: 10 })).getMeshes(stubTable, mockApi)
		expect(on.glow?.bulbGlow?.intensity).toBe(10)
	})

	it('no longer stamps a dead depthBias on glow entries', () => {
		const mockApi: any = { createBulbGlowGeometry: () => ({}) }
		const meshes = new Light(glowData({ state: 1, intensity: 10 })).getMeshes(stubTable, mockApi)
		expect(meshes.glow?.depthBias).toBeUndefined()
	})
})
