import { describe, expect, it } from 'vitest'
import { TableBuilder } from '../../../test/table-builder.js'
import { TestRenderApi } from '../../../test/test-render-api.js'
import { Vertex2D } from '../../util/vector.js'
import { DragPoint } from '../dragpoint.js'
import { Flasher, FlasherData } from './flasher.js'
import { FlasherMeshGenerator } from './flasher-mesh-generator.js'
import { FlasherState } from './flasher-state.js'
import { FlasherUpdater } from './flasher-updater.js'

describe('The VPinball flasher mesh generator and updater', () => {
	it('should generate a quad mesh from 4 drag points', () => {
		const table = new TableBuilder().build()
		const data = new FlasherData('Flasher1')
		data.dragPoints = [
			Object.assign(new DragPoint(), { vertex: new Vertex2D(0, 0) }),
			Object.assign(new DragPoint(), { vertex: new Vertex2D(100, 0) }),
			Object.assign(new DragPoint(), { vertex: new Vertex2D(100, 100) }),
			Object.assign(new DragPoint(), { vertex: new Vertex2D(0, 100) }),
		]
		data.height = 50

		const generator = new FlasherMeshGenerator()
		const mesh = generator.generateMesh(data, table)

		expect(mesh).toBeDefined()
		expect(mesh!.vertices.length).toBeGreaterThanOrEqual(4)
		expect(mesh!.indices.length).toBeGreaterThanOrEqual(6)
	})

	it('should calculate local UV coords for wrap alignment and table UV coords for world alignment', () => {
		const table = new TableBuilder().build()
		table.data.left = 0
		table.data.top = 0
		table.data.right = 500
		table.data.bottom = 1000
		const dataWrap = new FlasherData('WrapFlasher')
		dataWrap.imageAlignment = 0
		dataWrap.dragPoints = [
			Object.assign(new DragPoint(), { vertex: new Vertex2D(50, 50) }),
			Object.assign(new DragPoint(), { vertex: new Vertex2D(150, 50) }),
			Object.assign(new DragPoint(), { vertex: new Vertex2D(150, 150) }),
			Object.assign(new DragPoint(), { vertex: new Vertex2D(50, 150) }),
		]

		const generator = new FlasherMeshGenerator()
		const meshWrap = generator.generateMesh(dataWrap, table)
		expect(meshWrap).toBeDefined()
		expect(meshWrap!.vertices[0]!.tu).toBeCloseTo(0, 1e-4)
		expect(meshWrap!.vertices[0]!.tv).toBeCloseTo(0, 1e-4)

		const dataWorld = new FlasherData('WorldFlasher')
		dataWorld.imageAlignment = 1
		dataWorld.dragPoints = dataWrap.dragPoints
		const meshWorld = generator.generateMesh(dataWorld, table)
		expect(meshWorld).toBeDefined()
		const tableDimensions = table.getDimensions()
		const expectedTu = (50 - table.data.left) / tableDimensions.width
		expect(meshWorld!.vertices[0]!.tu).toBeCloseTo(expectedTu, 1e-4)
	})

	it('should return undefined if drag points cannot form a valid polygon', () => {
		const table = new TableBuilder().build()
		const data = new FlasherData('InvalidFlasher')
		data.dragPoints = [
			Object.assign(new DragPoint(), { vertex: { x: 0, y: 0 } }),
			Object.assign(new DragPoint(), { vertex: { x: 10, y: 10 } }),
		]

		const generator = new FlasherMeshGenerator()
		expect(generator.generateMesh(data, table)).toBeUndefined()
	})

	it('should apply additive blending uniforms in FlasherUpdater', () => {
		const data = new FlasherData('AddFlasher')
		data.addBlend = true
		data.intensityScale = 2
		const state = FlasherState.claim('AddFlasher', true, 0xff8844, 80)
		const updater = new FlasherUpdater(state, data)

		let tintColor = 0
		const intensityVal = 0
		const targetMesh = {
			isMesh: true,
			material: {
				needsUpdate: false,
				userData: {
					__uTint: {
						value: {
							set: (hexColor: number) => {
								tintColor = hexColor
							},
						},
					},
					__uIntensity: { value: 0 },
				},
			},
		}
		const node = {
			visible: false,
			traverse: (callback: (child: unknown) => void) => callback(targetMesh),
		}

		const renderApi = new TestRenderApi()
		const table = new TableBuilder().build()
		updater.applyState(node, state, renderApi, table)

		expect(node.visible).toBe(true)
		expect(tintColor).toBe(0xff8844)
		expect(targetMesh.material.userData.__uIntensity.value).toBeCloseTo((80 * 2) / 100, 1e-5)
		expect(targetMesh.material.needsUpdate).toBe(true)
	})

	it('should hide flasher if alpha is zero or additive color is black (native VPX)', () => {
		const data = new FlasherData('AddFlasher')
		data.addBlend = true
		const state = FlasherState.claim('AddFlasher', true, 0x000000, 100)
		const updater = new FlasherUpdater(state, data)

		const node = {
			visible: true,
			traverse: () => {},
		}
		const renderApi = new TestRenderApi()
		const table = new TableBuilder().build()

		updater.applyState(node, state, renderApi, table)
		expect(node.visible).toBe(false)

		state.color = 0xffffff
		state.alpha = 0
		updater.applyState(node, state, renderApi, table)
		expect(node.visible).toBe(false)
	})

	it('should apply standard opacity when addBlend is false', () => {
		const data = new FlasherData('NormalFlasher')
		data.addBlend = false
		const state = FlasherState.claim('NormalFlasher', true, 0x112233, 50)
		const updater = new FlasherUpdater(state, data)

		let assignedColor = 0
		const material: {
			color?: { set: (hexColor: number) => void }
			opacity?: number
			transparent?: boolean
			needsUpdate?: boolean
		} = {
			color: {
				set: (hexColor: number) => {
					assignedColor = hexColor
				},
			},
			opacity: 1,
			transparent: false,
			needsUpdate: false,
		}
		const targetMesh = { isMesh: true, material }
		const node = {
			visible: false,
			traverse: (callback: (child: unknown) => void) => callback(targetMesh),
		}

		const renderApi = new TestRenderApi()
		const table = new TableBuilder().build()
		updater.applyState(node, state, renderApi, table)

		expect(node.visible).toBe(true)
		expect(assignedColor).toBe(0x112233)
		expect(material.opacity).toBeCloseTo(0.5, 1e-5)
		expect(material.transparent).toBe(true)
		expect(material.needsUpdate).toBe(true)
	})

	it('should synchronize FlasherApi property updates to FlasherState', async () => {
		const { NodeBinaryReader } = await import('../../io/binary-reader.node.js')
		const { ThreeHelper } = await import('../../../test/three.helper.js')
		const { Player } = await import('../../game/player.js')
		const { Table } = await import('../table/table.js')

		const three = new ThreeHelper()
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-flasher.vpx')))
		const player = new Player(table).init()

		const flasherItem = table.flashers.Flasher
		expect(flasherItem).toBeDefined()
		const api = flasherItem.getApi()
		const state = flasherItem.getState()

		api.RotX = 45
		api.RotY = 60
		api.RotZ = 90
		api.Height = 120
		api.Color = 0x00ff88
		api.Alpha = 75
		api.Visible = false

		expect(state.rotX).toBe(45)
		expect(state.rotY).toBe(60)
		expect(state.rotZ).toBe(90)
		expect(state.height).toBe(120)
		expect(state.color).toBe(0x00ff88)
		expect(state.alpha).toBe(75)
		expect(state.isVisible).toBe(false)

		const poppedStates = player.popStates()
		expect(poppedStates.getState<FlasherState>('Flasher')?.alpha).toBe(75)
	})
})
