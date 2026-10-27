// Behavior specs for the three.js light-generator fixes:
// falloffPower passthrough, centralized authored visibility, and the
// two-argument applyLighting contract.

import { Group, Mesh, PlaneGeometry, PointLight } from 'three'
import { describe, expect, it } from 'vitest'
import { Vertex2D } from '../../math/vector.js'
import { Light, LightData, LightState } from '../../vpt/light/light.js'
import { getAuthoredVisible, setAuthoredVisible } from './authored-visible.js'
import { createBulbGlowNodeMaterial } from './nodes/bulb-glow-node.js'
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

	it('gates the glow quad on the centralized flag', () => {
		const gen = new ThreeLightGenerator()
		const group = new Group()
		const glow = new Mesh(
			new PlaneGeometry(1, 1),
			createBulbGlowNodeMaterial({
				color: 0xff6020,
				color2: 0xffffff,
				centerX: 0,
				centerY: 0,
				falloff: 100,
				falloffPower: 2,
				intensity: 0,
			}) as any,
		)
		glow.name = 'bulb.glow'
		group.add(glow)
		expect(getAuthoredVisible(glow)).toBe(true)
		const on = LightState.claim('x', 9, 0xffffff, 0xffffff)
		gen.applyLighting(on, group as any)
		expect(glow.visible).toBe(true)
		setAuthoredVisible(glow, false)
		gen.applyLighting(on, group as any)
		expect(glow.visible).toBe(false)
	})
})

describe('applyLighting contract', () => {
	it('applies the state to the light node', () => {
		const gen = new ThreeLightGenerator()
		const group = new Group()
		const point = new PointLight(0xffffff, 0)
		point.name = 'light'
		group.add(point)
		gen.applyLighting(LightState.claim('x', 9, 0xff0000, 0xff0000), group as any)
		expect(point.intensity).toBe(9)
	})

	it('updater forwards (state, node) without an intensity base', () => {
		const data = mkData({ state: 1, intensity: 10 })
		const light = new Light(data)
		const calls: unknown[][] = []
		const api: any = {
			applyLighting: (...args: unknown[]) => {
				calls.push(args)
			},
		}
		light.getUpdater().applyState({} as any, LightState.claim('L1', 3, 1, 1), api, {} as any)
		expect(calls.length).toBe(1)
		expect(calls[0]).toHaveLength(2)
	})

	it('leaves bulb glass static: base meshes carry no live state upstream either', () => {
		const gen = new ThreeLightGenerator()
		const group = new Group()
		const glass = new Mesh(new PlaneGeometry(1, 1))
		glass.name = 'bulb.light'
		const before = glass.visible
		gen.applyLighting(LightState.claim('x', 0, 0xffffff, 0xffffff), group as any)
		expect(glass.visible).toBe(before)
	})

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
