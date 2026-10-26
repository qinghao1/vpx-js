import { describe, expect, it } from 'vitest'
import { TableBuilder } from '../../../test/table-builder.js'
import { TestRenderApi } from '../../../test/test-render-api.js'
import { Vertex2D } from '../../math/vector.js'
import type { IRenderApi } from '../../render/irender-api.js'
import { DragPoint } from '../dragpoint.js'
import { Enums } from '../enums.js'
import type { Mesh } from '../mesh.js'
import { FlasherData } from './flasher-data.js'
import { FlasherMeshGenerator } from './flasher-mesh-generator.js'
import { FlasherState } from './flasher-state.js'
import { FlasherUpdater } from './flasher-updater.js'

/** FlasherData's constructor is private; construct fixtures through a minimal cast. */
function createFlasherData(name: string): FlasherData {
	const ctor = FlasherData as unknown as new (itemName: string) => FlasherData
	return new ctor(name)
}

describe('The VPinball flasher mesh generator and updater', () => {
	it('should generate a quad mesh from 4 drag points', () => {
		const table = new TableBuilder().build()
		const data = createFlasherData('Flasher1')
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
		const dataWrap = createFlasherData('WrapFlasher')
		dataWrap.imageAlignment = Enums.RampImageAlignment.ImageModeWrap
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

		const dataWorld = createFlasherData('WorldFlasher')
		dataWorld.imageAlignment = Enums.RampImageAlignment.ImageModeWorld
		dataWorld.dragPoints = dataWrap.dragPoints
		const meshWorld = generator.generateMesh(dataWorld, table)
		expect(meshWorld).toBeDefined()
		const tableDimensions = table.getDimensions()
		const expectedTu = (50 - table.data.left) / tableDimensions.width
		expect(meshWorld!.vertices[0]!.tu).toBeCloseTo(expectedTu, 1e-4)
		const expectedTv = (50 - table.data.top) / tableDimensions.height
		expect(meshWorld!.vertices[0]!.tv).toBeCloseTo(expectedTv, 1e-4)
	})

	it('should bake rotated unit normals into the flasher mesh', () => {
		const table = new TableBuilder().build()
		const data = createFlasherData('NormalFlasher')
		data.dragPoints = [
			Object.assign(new DragPoint(), { vertex: new Vertex2D(0, 0) }),
			Object.assign(new DragPoint(), { vertex: new Vertex2D(100, 0) }),
			Object.assign(new DragPoint(), { vertex: new Vertex2D(100, 100) }),
			Object.assign(new DragPoint(), { vertex: new Vertex2D(0, 100) }),
		]
		data.height = 50

		const generator = new FlasherMeshGenerator()
		const flat = generator.generateMesh(data, table)
		expect(flat).toBeDefined()
		for (const vertex of flat!.vertices) {
			expect(vertex.nx).toBeCloseTo(0, 5)
			expect(vertex.ny).toBeCloseTo(0, 5)
			expect(vertex.nz).toBeCloseTo(-1, 5)
		}

		data.rotX = 90
		const tilted = generator.generateMesh(data, table)
		expect(tilted).toBeDefined()
		for (const vertex of tilted!.vertices) {
			expect(vertex.nx).toBeCloseTo(0, 5)
			expect(vertex.ny).toBeCloseTo(-1, 5)
			expect(vertex.nz).toBeCloseTo(0, 5)
		}
	})

	it('should regenerate the mesh node when rot/height state changes', () => {
		const table = new TableBuilder().build()
		const data = createFlasherData('SpinFlasher')
		data.dragPoints = [
			Object.assign(new DragPoint(), { vertex: new Vertex2D(0, 0) }),
			Object.assign(new DragPoint(), { vertex: new Vertex2D(100, 0) }),
			Object.assign(new DragPoint(), { vertex: new Vertex2D(100, 100) }),
			Object.assign(new DragPoint(), { vertex: new Vertex2D(0, 100) }),
		]
		data.height = 50
		const state = FlasherState.claim('SpinFlasher', true, 0xffffff, 100, 0, 0, 0, 50)
		const updater = new FlasherUpdater(state, data)

		const applied: Mesh[] = []
		const found: string[] = []
		const renderApi = new TestRenderApi() as unknown as IRenderApi<any, any, any>
		renderApi.applyMeshToNode = (mesh: Mesh) => {
			applied.push(mesh)
		}
		renderApi.findInGroup = ((_parent: unknown, name: string) => {
			found.push(name)
			return {}
		}) as typeof renderApi.findInGroup
		const node = { visible: true, traverse: () => {} }

		const generator = new FlasherMeshGenerator()
		const before = generator.generateMesh(data, table)!.vertices.map(vertex => [vertex.x, vertex.y, vertex.z])

		const moved = state.clone()
		moved.rotZ = 45
		moved.height = 120
		updater.applyState(node, moved, renderApi, table)

		expect(found).toEqual(['flasher-SpinFlasher'])
		expect(applied.length).toBe(1)
		const after = applied[0]!.vertices.map(vertex => [vertex.x, vertex.y, vertex.z])
		expect(after).not.toEqual(before)

		const tinted = moved.clone()
		tinted.color = 0x112233
		updater.applyState(node, tinted, renderApi, table)
		expect(applied.length).toBe(1)
	})

	it('should derive the flasher center from the drag-point outline', () => {
		const data = createFlasherData('CenterFlasher')
		data.dragPoints = [
			Object.assign(new DragPoint(), { vertex: new Vertex2D(0, 0) }),
			Object.assign(new DragPoint(), { vertex: new Vertex2D(100, 0) }),
			Object.assign(new DragPoint(), { vertex: new Vertex2D(100, 100) }),
			Object.assign(new DragPoint(), { vertex: new Vertex2D(0, 100) }),
		]

		const center = data.getCenter()
		expect(center.x).toBeCloseTo(50, 5)
		expect(center.y).toBeCloseTo(50, 5)
	})

	it('should return the origin as center when there are no drag points', () => {
		const data = createFlasherData('EmptyFlasher')
		data.dragPoints = []

		const center = data.getCenter()
		expect(center.x).toBe(0)
		expect(center.y).toBe(0)
	})

	it('should return undefined if drag points cannot form a valid polygon', () => {
		const table = new TableBuilder().build()
		const data = createFlasherData('InvalidFlasher')
		data.dragPoints = [
			Object.assign(new DragPoint(), { vertex: { x: 0, y: 0 } }),
			Object.assign(new DragPoint(), { vertex: { x: 10, y: 10 } }),
		]

		const generator = new FlasherMeshGenerator()
		expect(generator.generateMesh(data, table)).toBeUndefined()
	})

	it('should apply additive blending uniforms in FlasherUpdater', () => {
		const data = createFlasherData('AddFlasher')
		data.addBlend = true
		data.intensityScale = 2
		const state = FlasherState.claim('AddFlasher', true, 0xff8844, 80)
		const updater = new FlasherUpdater(state, data)

		let tintColor = 0
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

		const renderApi = new TestRenderApi() as unknown as IRenderApi<any, any, any>
		const table = new TableBuilder().build()
		updater.applyState(node, state, renderApi, table)

		expect(node.visible).toBe(true)
		expect(tintColor).toBe(0xff8844)
		expect(targetMesh.material.userData.__uIntensity.value).toBeCloseTo((80 * 2) / 100, 1e-5)
		expect(targetMesh.material.needsUpdate).toBe(true)
	})

	it('should hide flasher if alpha is zero or additive color is black (native VPX)', () => {
		const data = createFlasherData('AddFlasher')
		data.addBlend = true
		const state = FlasherState.claim('AddFlasher', true, 0x000000, 100)
		const updater = new FlasherUpdater(state, data)

		const node = {
			visible: true,
			traverse: () => {},
		}
		const renderApi = new TestRenderApi() as unknown as IRenderApi<any, any, any>
		const table = new TableBuilder().build()

		updater.applyState(node, state, renderApi, table)
		expect(node.visible).toBe(false)

		state.color = 0xffffff
		state.alpha = 0
		updater.applyState(node, state, renderApi, table)
		expect(node.visible).toBe(false)
	})

	it('should apply standard opacity when addBlend is false', () => {
		const data = createFlasherData('NormalFlasher')
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

		const renderApi = new TestRenderApi() as unknown as IRenderApi<any, any, any>
		const table = new TableBuilder().build()
		updater.applyState(node, state, renderApi, table)

		expect(node.visible).toBe(true)
		expect(assignedColor).toBe(0x112233)
		expect(material.opacity).toBeCloseTo(0.5, 1e-5)
		expect(material.transparent).toBe(true)
		expect(material.needsUpdate).toBe(true)
	})

	it('should hide a sequencer-locked flasher with inPlayState off and reveal it on unlock', () => {
		const table = new TableBuilder().build()
		const data = createFlasherData('SeqFlasher')
		data.addBlend = false
		const state = FlasherState.claim('SeqFlasher', true, 0x112233, 50)
		const updater = new FlasherUpdater(state, data)

		const material: {
			color?: { set: (hexColor: number) => void }
			opacity?: number
			transparent?: boolean
			needsUpdate?: boolean
		} = {
			color: { set: () => {} },
			opacity: 1,
			transparent: false,
			needsUpdate: false,
		}
		const targetMesh = { isMesh: true, material }
		const node = {
			visible: false,
			traverse: (callback: (child: unknown) => void) => callback(targetMesh),
		}
		const renderApi = new TestRenderApi() as unknown as IRenderApi<any, any, any>

		updater.applyState(node, state, renderApi, table)
		expect(node.visible).toBe(true)

		const lockedOff = state.clone()
		lockedOff.lockedByLS = true
		lockedOff.inPlayState = false
		updater.applyState(node, lockedOff, renderApi, table)
		expect(node.visible).toBe(false)

		// Locked-on but script-hidden stays hidden like upstream (m_d.m_isVisible gate).
		const lockedHidden = state.clone()
		lockedHidden.lockedByLS = true
		lockedHidden.inPlayState = true
		lockedHidden.isVisible = false
		updater.applyState(node, lockedHidden, renderApi, table)
		expect(node.visible).toBe(false)

		const unlocked = lockedHidden.clone()
		unlocked.lockedByLS = false
		unlocked.isVisible = true
		updater.applyState(node, unlocked, renderApi, table)
		expect(node.visible).toBe(true)
	})

	it('should modulate alpha by the LMAP-linked light intensity', () => {
		const table = new TableBuilder().build()
		const data = createFlasherData('LmFlasher')
		data.addBlend = false
		data.szLightmap = 'L1'
		const state = FlasherState.claim('LmFlasher', true, 0x112233, 100)
		const updater = new FlasherUpdater(state, data)

		let currentIntensity = 10
		;(table as any).lights = {
			L1: {
				data: { intensity: 10 },
				getAnimation: () => ({ intensityScale: 1 }),
				getState: () => ({ intensity: currentIntensity }),
			},
		}
		const material: { opacity?: number; transparent?: boolean; needsUpdate?: boolean } = { opacity: 1 }
		const node: any = {
			visible: false,
			traverse: (callback: (child: unknown) => void) => callback({ isMesh: true, material }),
		}
		const renderApi = new TestRenderApi() as unknown as IRenderApi<any, any, any>

		updater.applyState(node, state, renderApi, table)
		expect(node.visible).toBe(true)
		expect(material.opacity).toBeCloseTo(1, 1e-5)

		currentIntensity = 5
		updater.applyState(node, state, renderApi, table)
		expect(material.opacity).toBeCloseTo(0.5, 1e-5)

		currentIntensity = 0
		updater.applyState(node, state, renderApi, table)
		expect(node.visible).toBe(false)
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
