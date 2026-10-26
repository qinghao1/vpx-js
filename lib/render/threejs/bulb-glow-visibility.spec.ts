import { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import { LightState } from '../../vpt/light/light-state.js'
import { createBulbGlowNodeMaterial } from './nodes/bulb-glow-node.js'
import { createPrimitiveAdditiveMaterial } from './nodes/primitive-bdl-node.js'
import { ThreeConverter } from './three-converter.js'
import { ThreeLightGenerator } from './three-light-generator.js'
import { applyWhiteWallPass } from './visibility-heuristics.js'

function glowQuad(): Mesh {
	const mat = createBulbGlowNodeMaterial({
		color: 0xff6020,
		color2: 0xffffff,
		centerX: 500,
		centerY: 1000,
		falloff: 300,
		falloffPower: 2,
		intensity: 0,
	})
	const mesh = new Mesh(new PlaneGeometry(100, 100), mat as any)
	mesh.name = 'bulb.glow'
	mesh.visible = true
	return mesh
}

describe('bulb glow visibility', () => {
	it('white-wall pass keeps shader-driven glow quads but hides plain white walls', () => {
		const root = new Group()
		const glow = glowQuad()
		const wall = new Mesh(new PlaneGeometry(100, 100), new MeshStandardMaterial({ color: 0xffffff }))
		wall.name = 'wall_stray'
		wall.visible = true
		root.add(glow, wall)
		const stats: Record<string, number> = {}
		const nodes: any[] = []
		root.traverse(o => nodes.push(o))
		applyWhiteWallPass(nodes, stats)
		expect(glow.visible).toBe(true)
		expect(wall.visible).toBe(false)
	})

	it('additive overlays win the coplanar tie against the opaque bake below', () => {
		const mat = createPrimitiveAdditiveMaterial({})
		expect(mat.depthTest).toBe(true)
		expect(mat.polygonOffset).toBe(true)
		expect(mat.polygonOffsetFactor).toBe(-2)
		expect(mat.polygonOffsetUnits).toBe(-4)
	})

	it('light updater shows the quad only while the lamp is on', () => {
		const gen = new ThreeLightGenerator()
		const group = new Group()
		group.name = '106'
		const glow = glowQuad()
		glow.visible = false
		group.add(glow)
		const on = new LightState()
		on.intensity = 707
		gen.applyLighting(on, 0, group as any)
		expect(glow.visible).toBe(true)
		const off = new LightState()
		off.intensity = 0
		gen.applyLighting(off, 0, group as any)
		expect(glow.visible).toBe(false)
		// Plain material without the glow flag is untouched by the updater.
		const plain = new Mesh(new PlaneGeometry(10, 10), new MeshBasicMaterial())
		plain.name = 'bulb.glow'
		plain.visible = false
		const group2 = new Group()
		group2.add(plain)
		gen.applyLighting(on, 0, group2 as any)
		expect(plain.visible).toBe(true)
	})

	it('authored-invisible glow quad stays hidden when the lamp is driven on', () => {
		const gen = new ThreeLightGenerator()
		const group = new Group()
		const glow = glowQuad()
		glow.visible = false
		glow.userData.__authoredVisible = false
		group.add(glow)
		const on = new LightState()
		on.intensity = 707
		gen.applyLighting(on, 0, group as any)
		expect(glow.visible).toBe(false)
		// Lamp state still reaches the shader uniforms; only visibility is gated.
		expect((glow.material as any).userData.__uIntensity.value).toBe(707)
		const off = new LightState()
		off.intensity = 0
		gen.applyLighting(off, 0, group as any)
		expect(glow.visible).toBe(false)
	})

	it('authored-visible glow quad still toggles with the lamp state', () => {
		const gen = new ThreeLightGenerator()
		const group = new Group()
		const glow = glowQuad()
		glow.visible = false
		glow.userData.__authoredVisible = true
		group.add(glow)
		const on = new LightState()
		on.intensity = 707
		gen.applyLighting(on, 0, group as any)
		expect(glow.visible).toBe(true)
		const off = new LightState()
		off.intensity = 0
		gen.applyLighting(off, 0, group as any)
		expect(glow.visible).toBe(false)
	})

	it('createMesh stamps authored visibility onto bulb-glow quads', () => {
		const converter = new ThreeConverter(
			{} as any,
			{ getInitialMaterial: () => new MeshBasicMaterial() } as any,
			{} as any,
		)
		const geo = new PlaneGeometry(10, 10)
		geo.name = 'bulb.glow'
		const quad = converter.createMesh({
			isVisible: false,
			geometry: geo,
			bulbGlow: {
				color: 0xff6020,
				color2: 0xffffff,
				centerX: 0,
				centerY: 0,
				falloff: 1,
				falloffPower: 1,
				intensity: 0,
			},
		} as any)
		expect(quad.visible).toBe(false)
		expect(quad.userData.__authoredVisible).toBe(false)
		// End to end: driving the lamp on must not unhide it.
		const group = new Group()
		group.add(quad)
		const gen = new ThreeLightGenerator()
		const on = new LightState()
		on.intensity = 707
		gen.applyLighting(on, 0, group as any)
		expect(quad.visible).toBe(false)
	})
})
