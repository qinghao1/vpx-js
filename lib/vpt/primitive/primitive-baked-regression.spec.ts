import { describe, expect, it } from 'vitest'
import { TableBuilder } from '../../../test/table-builder.js'
import { ThreeRenderApi } from '../../render/threejs/three-render-api.js'
import { TableMeshGenerator } from '../table/table-mesh-generator.js'

describe('regression: primitive baked is dynamic via disableLightingTop', () => {
	it('should treat disableLightingTop>0.5 as baked even when material not baked', async () => {
		const table = new TableBuilder()
			.addMaterial('insertonwhiteon', { baseColor: 0xffffff })
			.addPrimitive('InsertOn', {
				szMaterial: 'insertonwhiteon',
				szImage: '',
				disableLightingTop: 0,
				disableLightingBelow: 1,
				alpha: 100,
				isVisible: true,
			})
			.build()
		const api = new ThreeRenderApi({ applyMaterials: true } as any)
		const gen = new TableMeshGenerator(table)
		const scene = gen.generateTableNode(api, {})
		let node: any = null
		scene.traverse(o => {
			if (o.name === 'InsertOn') node = o
		})
		expect(node).toBeTruthy()
		const mesh = node.children[0]
		let mat = mesh.material as any

		const prim = table.primitives.InsertOn
		prim.getUpdater().applyState(node, { disableLightingTop: 800 } as any, api, table)
		mat = node.children[0].material as any
		expect(mat.color.getHex()).toEqual(0x000000)
		expect(mat.emissive.getHexString().toLowerCase()).toEqual('ffffff')
		expect(mat.emissiveIntensity).toEqual(1.0)
		prim.getUpdater().applyState(node, { disableLightingTop: 0 } as any, api, table)
		mat = node.children[0].material as any
		expect(mat.emissive.getHex()).toEqual(0x000000)
		expect(mat.emissiveIntensity).toEqual(0)
	}, 15000)

	it('should keep non-baked when dlTop <=0.5 and no bake name', async () => {
		const table = new TableBuilder()
			.addMaterial('insertrectangle1off', { baseColor: 0xc8e1ff })
			.addPrimitive('InsertOff', {
				szMaterial: 'insertrectangle1off',
				szImage: '',
				disableLightingTop: 0,
				disableLightingBelow: 1,
				alpha: 100,
				isVisible: true,
			})
			.build()
		const api = new ThreeRenderApi({ applyMaterials: true } as any)
		const gen = new TableMeshGenerator(table)
		const scene = gen.generateTableNode(api, {})
		let node: any = null
		scene.traverse(o => {
			if (o.name === 'InsertOff') node = o
		})
		const mesh = node.children[0]
		let mat = mesh.material as any
		const prim = table.primitives.InsertOff
		prim.getUpdater().applyState(node, { disableLightingTop: 0 } as any, api, table)
		mat = node.children[0].material as any
		expect(mat.emissive.getHex()).toEqual(0x000000)
		expect(mat.emissiveIntensity).toEqual(0)
		prim.getUpdater().applyState(node, { disableLightingTop: 800 } as any, api, table)
		mat = node.children[0].material as any
		expect(mat.color.getHex()).toEqual(0x000000)
		expect(mat.emissiveIntensity).toEqual(1.0)
	}, 15000)
})
