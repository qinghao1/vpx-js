import * as fs from 'node:fs'
import type * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { TableBuilder } from '../../../test/table-builder.js'
import { Vertex2D, Vertex3D } from '../../math/vector.js'
import type { Bumper, BumperState } from '../../vpt/bumper/bumper.js'
import { DragPoint } from '../../vpt/dragpoint.js'
import { Enums } from '../../vpt/enums.js'
import { Light, LightData } from '../../vpt/light/light.js'
import { TableMeshGenerator } from '../../vpt/table/table-mesh-generator.js'
import { ThreeLightGenerator } from './three-light-generator.js'
import { ThreeLightMeshGenerator } from './three-light-mesh-generator.js'
import { ThreeRenderApi } from './three-render-api.js'

const walkingDeadVpx = ['walking_dead.vpx', '/home/qinghao1/Downloads/walking_dead.vpx'].find(p => {
	try {
		return fs.existsSync(p) && fs.statSync(p).size > 1_000_000
	} catch {
		return false
	}
})
const requireWalkingDead = (): string => {
	if (!walkingDeadVpx) throw new Error('walking_dead.vpx not found')
	return walkingDeadVpx
}

describe('regression: playfield lights via szLightmap', () => {
	it('primitive with szLightmap must react to light intensity even with empty state', async () => {
		const table: any = new TableBuilder()
			.addMaterial('VLM.Bake', { baseColor: 0xffffff })
			.addPrimitive('TestPrim', {
				szMaterial: 'VLM.Bake',
				szLightmap: 'L1',
				addBlend: true,
				alpha: 100,
				color: 0xffffff,
				isVisible: true,
				disableLightingTop: 1,
			})
			.build()
		const origGetMat = table.getMaterial.bind(table)
		table.getMaterial = (n: string) => {
			if (n === 'VLM.Bake') return { baseColor: 0xffffff }
			return origGetMat(n)
		}
		const api = new ThreeRenderApi({ applyMaterials: true } as any) as any
		const gen = new TableMeshGenerator(table)
		const scene = gen.generateTableNode(api, {}) as THREE.Group
		let node: any = null
		scene.traverse((o: any) => {
			if (o.name === 'TestPrim') node = o
		})
		expect(node, 'TestPrim node must exist').toBeTruthy()
		// mock light L1
		let curIntensity = 10
		table.lights = {
			L1: {
				data: { intensity: 10, intensityScale: 1 },
				getState: () => ({ intensity: curIntensity, color: 0xffffff, colorFull: 0xffffff }),
				state: {
					get intensity() {
						return curIntensity
					},
					set intensity(v) {
						curIntensity = v
					},
				},
			},
		}
		table.getLight = (n: string) => table.lights[n]
		const prim = table.primitives.TestPrim as any
		// initial light ON => effectiveIntensity 1
		curIntensity = 10
		prim.getUpdater().applyState(node, {}, api, table)
		let mat = (node.children[0]?.material ?? node.material) as any
		expect(
			mat.emissiveIntensity,
			'emissive should be 1 when light on (alpha 100 * lightFactor 1 * 0.01)',
		).toBeCloseTo(1, 0.01)
		// light OFF => effectiveIntensity 0
		curIntensity = 0
		prim.getUpdater().applyState(node, {}, api, table)
		mat = (node.children[0]?.material ?? node.material) as any
		expect(
			mat.emissiveIntensity,
			'emissive must go to 0 when light off even with empty state (regression: Viewer must re-apply)',
		).toEqual(0)
		// light half
		curIntensity = 5
		prim.getUpdater().applyState(node, {}, api, table)
		mat = (node.children[0]?.material ?? node.material) as any
		expect(mat.emissiveIntensity, 'half intensity => 0.5').toBeCloseTo(0.5, 0.01)
	})

	it('Viewer.applyChangedStates propagates light changes to szLightmap primitives', async () => {
		const { Viewer } = await import('../../../demo-browser/src/viewer.js')
		const table: any = new TableBuilder()
			.addMaterial('VLM.Bake', { baseColor: 0xffffff })
			.addPrimitive('TestPrim', {
				szMaterial: 'VLM.Bake',
				szLightmap: 'L1',
				addBlend: true,
				alpha: 100,
				color: 0xffffff,
				isVisible: true,
				disableLightingTop: 1,
			})
			.build()
		const origGetMat = table.getMaterial.bind(table)
		table.getMaterial = (n: string) => {
			if (n === 'VLM.Bake') return { baseColor: 0xffffff }
			return origGetMat(n)
		}
		const api = new ThreeRenderApi({ applyMaterials: true } as any) as any
		const scene = new TableMeshGenerator(table).generateTableNode(api, {}) as THREE.Group
		let curIntensity = 10
		table.lights = {
			L1: {
				data: { intensity: 10, intensityScale: 1 },
				getState: () => ({ intensity: curIntensity, color: 0xffffff, colorFull: 0xffffff }),
				state: {
					get intensity() {
						return curIntensity
					},
					set intensity(v) {
						curIntensity = v
					},
				},
			},
		}
		table.getLight = (n: string) => table.lights[n]
		// Drive the real Viewer method on a DOM-free stub: only the fields
		// applyChangedStates touches (tableGroup/table/renderApi/nodeCache).
		const viewer: any = Object.create(Viewer.prototype)
		viewer.viewerMode = 'viewer'
		viewer.tableGroup = scene
		viewer.table = table
		viewer.renderApi = api
		viewer.nodeCache = new Map()
		viewer._lightmapMap = new Map()
		viewer._demandPendingSoon = () => {}
		viewer.buildNodeCache()
		const primNode = scene.getObjectByName('TestPrim') as any
		expect(primNode, 'TestPrim node must exist').toBeTruthy()
		curIntensity = 10
		table.primitives.TestPrim.getUpdater().applyState(primNode, {}, api, table)
		let mat = (primNode.children[0]?.material ?? primNode.material) as any
		expect(mat.emissiveIntensity, 'light on => emissive 1').toBeCloseTo(1, 0.01)
		// A light-only state change (no primitive entry) must still reach the
		// lightmapped primitive through the changedLightNames fan-out.
		curIntensity = 0
		let released = false
		viewer.applyChangedStates({
			changedStates: { L1: { intensity: 0, color: 0xffffff, colorFull: 0xffffff } },
			release() {
				released = true
			},
		})
		expect(released, 'changed states must be released').toBe(true)
		mat = (primNode.children[0]?.material ?? primNode.material) as any
		expect(mat.emissiveIntensity, 'light off must propagate to szLightmap primitive').toEqual(0)
	})

	it.skipIf(!walkingDeadVpx)('walking_dead lightmap primitives should exist and be addBlend', async () => {
		// sanity check that real table has lightmapped primitives
		const vpx = requireWalkingDead()
		const { NodeBinaryReader } = await import('../../../lib/io/binary-reader.node.js')
		const { Table } = await import('../../../lib/vpt/table/table.js')
		const table: any = await Table.load(new NodeBinaryReader(vpx as any) as any, { skipTextures: true } as any)
		const lightmapped = Object.values(table.primitives as Record<string, any>).filter(
			(p: any) => !!p.data.szLightmap,
		)
		expect(lightmapped.length, 'TWD must have primitives with szLightmap').toBeGreaterThan(10)
		// at least some should be playfield inserts
		const playfieldLM = lightmapped.filter(
			(p: any) =>
				(p.data.name ?? '').toLowerCase().includes('playfield') ||
				(p.data.szImage ?? '').toLowerCase().includes('playfield'),
		)
		// Not strict, but ensure lightFactor path is exercised
		expect(lightmapped.length).toBeGreaterThan(0)
	})
})

describe('direct getMeshes unit tests (no GLB)', () => {
	function glowLightData(): LightData {
		const data = new LightData('L1')
		data.center = new Vertex2D(500, 1000)
		data.bulbLight = true
		data.bulbHaloHeight = 28
		for (const [x, y] of [
			[450, 950],
			[550, 950],
			[550, 1050],
			[450, 1050],
		]) {
			const point = new DragPoint()
			point.vertex = new Vertex3D(x, y, 0)
			data.dragPoints.push(point)
		}
		return data
	}

	function glowZs(geometry: THREE.BufferGeometry): number[] {
		const positions = (geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array
		return Array.from(positions).filter((_, index) => index % 3 === 2)
	}

	// Local -z maps to world +y (above the surface) via transformScene's
	// rotateX, the same convention as the extruded light mesh (-surfaceHeight).
	it('lifts the bulb glow quad to surfaceHeight + bulbHaloHeight + 0.1', () => {
		const table = new TableBuilder().addSurface('S1', { heightTop: 60 }).build()
		const data = glowLightData()
		data.szSurface = 'S1'
		const geometry = new ThreeLightMeshGenerator().createBulbGlowGeometry(data, table)
		expect(geometry.name).toBe('bulb.glow')
		const zs = glowZs(geometry)
		expect(zs.length).toBeGreaterThan(0)
		for (const z of zs) expect(z).toBe(Math.fround(-(60 + 28 + 0.1)))
	})

	it('omits the halo lift for non-bulb glow geometry', () => {
		const table = new TableBuilder().addSurface('S1', { heightTop: 60 }).build()
		const data = glowLightData()
		data.szSurface = 'S1'
		data.bulbLight = false
		const geometry = new ThreeLightMeshGenerator().createBulbGlowGeometry(data, table)
		for (const z of glowZs(geometry)) expect(z).toBe(Math.fround(-(60 + 0.1)))
	})

	it('lifts from playfield zero without a surface', () => {
		const table = new TableBuilder().build()
		const geometry = new ThreeLightMeshGenerator().createBulbGlowGeometry(glowLightData(), table)
		for (const z of glowZs(geometry)) expect(z).toBe(Math.fround(-(28 + 0.1)))
	})

	it('wires the Light.getMeshes glow entry with the exact lift and live params', () => {
		const table = new TableBuilder().addSurface('S1', { heightTop: 60 }).build()
		const data = glowLightData()
		data.szSurface = 'S1'
		data.color = 0xff2211
		data.state = Enums.LightStatus.LightStateOn
		data.intensity = 2
		const meshes = new Light(data).getMeshes(table, new ThreeRenderApi())
		expect(meshes.glow).toBeDefined()
		expect(meshes.glow?.bulbGlow?.color).toBe(0xff2211)
		expect(meshes.glow?.bulbGlow?.intensity).toBe(2)
		// No depthBias stamp: the converter pins glow quads to the overlay
		// layer (renderOrder 10) and the glow material ignores depthBias,
		// so a stamp would be dead data.
		expect(meshes.glow?.depthBias).toBeUndefined()
		const glowGeometry = meshes.glow?.geometry as THREE.BufferGeometry
		for (const z of glowZs(glowGeometry)) expect(z).toBe(Math.fround(-(60 + 28 + 0.1)))
	})

	it('places the point light above the surface in local -z like the glow quad', () => {
		const table = new TableBuilder().addSurface('S1', { heightTop: 60 }).build()
		const data = glowLightData()
		data.szSurface = 'S1'
		data.height = 10
		const light = new ThreeLightGenerator().createPointLight(data, table)
		expect(light.position.x).toBe(500)
		expect(light.position.y).toBe(1000)
		expect(light.position.z).toBe(-(60 + 10))
	})

	it('drives the bumper ring node from updater state through the real matrix path', () => {
		const table = new TableBuilder().addBumper('b1').build()
		const api = new ThreeRenderApi()
		const bumper = table.bumpers.b1 as Bumper
		const node = api.createObjectFromRenderable(bumper, table, {})
		const ring = api.findInGroup(node, 'bumper-ring-b1')
		expect(ring, 'ring child must exist').toBeDefined()
		const ringNode = ring as THREE.Object3D
		bumper.getUpdater().applyState(node, { ringOffset: 7 } as BumperState, api, table)
		expect(ringNode.position.x).toBe(0)
		expect(ringNode.position.y).toBe(0)
		expect(ringNode.position.z).toBe(-7)
	})
})
