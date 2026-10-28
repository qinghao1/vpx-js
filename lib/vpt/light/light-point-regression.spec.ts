import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TableBuilder } from '../../../test/table-builder.js'
import { DragPoint } from '../dragpoint.js'
import { Light, LightData } from './light.js'

const TWD_VPX = 'walking_dead.vpx'

describe('regression: bulb lights with glow polygons are not scene lights', () => {
	it('should return true for hasBulbGlow and generate glow mesh with BulbGlowParams', () => {
		const lightData = new LightData('GlowLight')
		lightData.bulbLight = true
		lightData.dragPoints = [new DragPoint(), new DragPoint(), new DragPoint(), new DragPoint()]
		lightData.color = 0xff2211
		lightData.color2 = 0x1122ff
		lightData.falloff = 60
		lightData.falloffPower = 1.5
		lightData.bulbModulateVsAdd = 0.75
		lightData.state = 1
		lightData.intensity = 2
		lightData.center = { x: 50, y: 80 } as any

		expect(lightData.hasBulbGlow()).toBe(true)

		const light = new Light(lightData)
		expect(light.hasBulbGlow()).toBe(true)

		const mockRenderApi: any = {
			createBulbGlowGeometry: () => ({ isMock: true }),
		}
		const table = new TableBuilder().build()
		const meshes = light.getMeshes(table, mockRenderApi)
		expect(meshes.glow).toBeDefined()
		expect(meshes.glow!.bulbGlow).toBeDefined()
		expect(meshes.glow!.bulbGlow!.color).toBe(0xff2211)
		expect(meshes.glow!.bulbGlow!.color2).toBe(0x1122ff)
		expect(meshes.glow!.bulbGlow!.falloff).toBe(60)
		expect(meshes.glow!.bulbGlow!.falloffPower).toBe(1.5)
		expect(meshes.glow!.bulbGlow!.modulateVsAdd).toBe(0.75)
		expect(meshes.glow!.bulbGlow!.intensity).toBe(2)
	})

	it('should not generate point lights for bulbLight=true with drag-point polygons', async () => {
		const table = new TableBuilder().build()
		const targetTable = table as any
		targetTable.lights = {
			TWD_Light: {
				data: {
					bulbLight: true,
					showBulbMesh: false,
					meshRadius: 20,
					dragPoints: [{}, {}, {}, {}],
					center: { x: 0, y: 0 },
				},
				isBulbLight() {
					return (this as any).data.showBulbMesh && (this as any).data.meshRadius > 0
				},
				isSurfaceLight() {
					return false
				},
				getName() {
					return 'TWD_Light'
				},
				getMeshes() {
					return {}
				},
				getState() {
					return { isVisible: true }
				},
				center: { x: 0, y: 0 },
			},
			RoundLight: {
				data: { bulbLight: true, showBulbMesh: false, meshRadius: 20, dragPoints: [], center: { x: 0, y: 0 } },
				isBulbLight() {
					return (this as any).data.showBulbMesh && (this as any).data.meshRadius > 0
				},
				isSurfaceLight() {
					return false
				},
				getName() {
					return 'RoundLight'
				},
				getMeshes() {
					return {}
				},
				getState() {
					return { isVisible: true }
				},
				center: { x: 0, y: 0 },
			},
		} as any
		const { ThreeRenderApi } = await import('../../render/threejs/three-render-api.js')
		const { TableMeshGenerator } = await import('../table/table-mesh-generator.js')
		const api = new ThreeRenderApi({ applyMaterials: true } as any)
		const gen = new TableMeshGenerator(table)
		const scene = gen.generateTableNode(api, { exportLightBulbLights: true }) as any
		const names: string[] = []
		scene.traverse((childNode: any) => {
			if (childNode.isPointLight) names.push(childNode.parent?.name ?? '?')
		})
		// Polygon light renders as a glow quad (native lightmap pass), never as a scene
		// light; only the polygon-less fallback keeps a point light.
		expect(names).toEqual(['RoundLight'])
	})

	it.skipIf(!existsSync(TWD_VPX))(
		'should generate no point lights but glow meshes for walking_dead.vpx if available',
		async () => {
			const { NodeBinaryReader } = await import('../../io/binary-reader.node.js')
			const { Table } = await import('../table/table.js')
			const { ThreeRenderApi } = await import('../../render/threejs/three-render-api.js')
			const { TableMeshGenerator } = await import('../table/table-mesh-generator.js')
			const table = await Table.load(new NodeBinaryReader(TWD_VPX))
			const api = new ThreeRenderApi({ applyMaterials: true } as any)
			const gen = new TableMeshGenerator(table)
			const scene = gen.generateTableNode(api, { exportLightBulbLights: true }) as any
			let points = 0
			let glows = 0
			scene.traverse((childNode: any) => {
				if (childNode.isPointLight) points++
				if (childNode.name === 'bulb.glow') glows++
			})
			// All 165 TWD lights have drag-point polygons: zero scene lights, 165 glow quads.
			expect(points).toBe(0)
			expect(glows).toBe(165)
		},
	)
})
