import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { TableBuilder } from '../../../test/table-builder.js'
import { setPrimitiveMap } from '../../render/threejs/nodes/primitive-bdl-node.js'
import { ThreeRenderApi } from '../../render/threejs/three-render-api.js'
import { TableMeshGenerator } from '../table/table-mesh-generator.js'

describe('regression: primitive BDL uniforms survive streaming', () => {
	it('should hold script BDL in uniforms while the map streams, then keep it on arrival', async () => {
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
		const mat = mesh.material as any

		expect(mat.userData.__uBDL.value, 'BDL intent waits in the uniform').toEqual(0)
		expect(mat.userData.__uAlbedo.value.getHex(), 'flat albedo stays neutral').toEqual(0xffffff)
		const tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
		setPrimitiveMap(mat, tex, 'insertonwhiteon')
		expect(mat.userData.__uBDL.value, 'arrival keeps the script BDL').toEqual(0)
	}, 15000)

	it('should keep non-baked primitives on the BDL path for any BDL value', async () => {
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
		const mat = mesh.material as any
		expect(mat.userData.__primitiveKind, 'generic BDL material, not a baked one').toEqual('bdl')
		expect(mat.userData.__uBDL.value).toEqual(0)
		expect(mat.userData.__uAlbedo.value.getHex(), 'albedo carries the base tint').toEqual(0xc8e1ff)
		expect(mat.depthTest).toEqual(true)
		expect(mat.depthWrite).toEqual(true)
		expect(mat.transparent).toEqual(false)
		expect(mesh.renderOrder ?? 0).toEqual(0)
	}, 15000)

	it('insert sockets and buttons must remain opaque (native renders inserton* opaque-lit, addBlend=false)', async () => {
		const table = new TableBuilder()
			.addMaterial('insertrectangle1off', { baseColor: 0xc8e1ff })
			.addPrimitive('InsertButton', {
				szMaterial: 'insertrectangle1off',
				szImage: 'insertrectangle1off',
				depthBias: 500,
				disableLightingTop: 0,
				disableLightingBelow: 1,
				alpha: 100,
				isVisible: true,
			})
			.addMaterial('insertonledwhite1', { baseColor: 0xffffff })
			.addPrimitive('InsertSocket', {
				szMaterial: 'insertonledwhite1',
				szImage: 'rectdotson3',
				depthBias: 600,
				disableLightingTop: 0,
				disableLightingBelow: 1,
				alpha: 100,
				isVisible: true,
			})
			.build()
		const api = new ThreeRenderApi({ applyMaterials: true } as any)
		const gen = new TableMeshGenerator(table)
		const scene = gen.generateTableNode(api, {})
		let buttonNode: any = null
		let flareNode: any = null
		scene.traverse(o => {
			if (o.name === 'InsertButton') buttonNode = o
			if (o.name === 'InsertSocket') flareNode = o
		})
		expect(buttonNode).toBeTruthy()
		expect(flareNode).toBeTruthy()

		const btnMesh = buttonNode.children[0]
		const flareMesh = flareNode.children[0]

		// Initial unlit state
		expect(btnMesh.material.depthTest, 'button unlit depthTest').toBe(true)
		expect(btnMesh.material.depthWrite, 'button unlit depthWrite').toBe(true)
		expect(btnMesh.material.transparent, 'button unlit transparent').toBe(false)

		expect(flareMesh.material.depthTest, 'flare unlit depthTest').toBe(true)
		expect(flareMesh.material.depthWrite, 'flare unlit depthWrite').toBe(true)
		expect(flareMesh.material.transparent, 'flare unlit transparent').toBe(false)
	}, 15000)
})
