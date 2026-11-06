// Behavior specs for the three.js light-generator fixes:
// falloffPower passthrough, centralized authored visibility, and the
// glow renderOrder contract.

import { Mesh, PlaneGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import { Vertex2D } from '../../math/vector.js'
import { LightData } from '../../vpt/light/light.js'
import { getAuthoredVisible, setAuthoredVisible } from './authored-visible.js'
import { ThreeConverter } from './three-converter.js'
import { ThreeLightGenerator } from './three-light-generator.js'

function mkData(over: Partial<LightData> = {}): LightData {
	const d = new LightData('L1')
	d.center = new Vertex2D(500, 1000)
	Object.assign(d, over)
	return d
}

describe('point light bake', () => {
	it('uses the baked fractional level', () => {
		const gen = new ThreeLightGenerator()
		expect(gen.createPointLight(mkData({ state: 0.5, intensity: 10 })).intensity).toBe(5)
		expect(gen.createPointLight(mkData({ state: 2, intensity: 10, rgBlinkPattern: '01' })).intensity).toBe(0)
	})

	it('passes falloffPower through as decay', () => {
		const gen = new ThreeLightGenerator()
		const light = gen.createPointLight(mkData({ state: 1, intensity: 7, falloff: 300, falloffPower: 5 }))
		expect(light.decay).toBe(5)
		// Range mapping is untouched.
		expect(light.distance).toBe(300 * 0.05)
		expect(gen.createPointLight(mkData({ state: 1, intensity: 7 })).decay).toBe(2)
	})
})

describe('authored visibility', () => {
	it('defaults to true and round-trips', () => {
		const mesh = new Mesh(new PlaneGeometry(1, 1))
		expect(getAuthoredVisible(mesh)).toBe(true)
		setAuthoredVisible(mesh, false)
		expect(getAuthoredVisible(mesh)).toBe(false)
		expect(mesh.visible).toBe(true)
		setAuthoredVisible(mesh, true)
		expect(getAuthoredVisible(mesh)).toBe(true)
	})
})

describe('glow renderOrder contract', () => {
	it('keeps glow renderOrder at the overlay layer without a depthBias stamp', () => {
		const converter = new ThreeConverter({} as any, { getInitialMaterial: () => new Mesh() } as any, {} as any)
		const geo: any = new PlaneGeometry(10, 10)
		geo.name = 'bulb.glow'
		const quad: any = converter.createMesh({
			isVisible: true,
			geometry: geo,
			bulbGlow: { color: 1, color2: 2, centerX: 0, centerY: 0, falloff: 1, falloffPower: 1, intensity: 1 },
		} as any)
		expect(quad.renderOrder).toBe(10)
		expect(getAuthoredVisible(quad)).toBe(true)
	})
})
