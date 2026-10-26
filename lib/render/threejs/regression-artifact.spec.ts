// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import * as THREE from 'three'
import { TableBuilder } from '../../../test/table-builder.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { _resetQualityCache, isLowQuality } from '../../util/quality.js'
import { Mesh } from '../../vpt/mesh.js'
import { Table } from '../../vpt/table/table.js'
import { batchStaticOpaques, canBatch } from './three-batched-builder.js'
import { ThreeConverter } from './three-converter.js'
import { ThreeMeshGenerator } from './three-mesh-generator.js'
import { ThreeRenderApi } from './three-render-api.js'
import { applyBakedMaterial, isBakedMeshByNames, postProcessScene } from './three-scene-postprocess.js'

chai.use((sinonChai as any).default ?? sinonChai)

const findWalkingDead = (): string | undefined => {
	const candidates = [
		path.resolve('walking_dead.vpx'),
		path.join(process.env.HOME || '/home/qinghao1', 'Downloads/walking_dead.vpx'),
	]
	return candidates.find(p => {
		try {
			return fs.existsSync(p) && fs.statSync(p).size > 1024 * 1024
		} catch {
			return false
		}
	})
}
// Explicit gate: without the table these tests report skipped, never silently green.
const walkingDeadVpx = findWalkingDead()
const requireWalkingDead = (): string => {
	if (!walkingDeadVpx) throw new Error('walking_dead.vpx not found')
	return walkingDeadVpx
}

function makeMesh(name, geometry, mat) {
	const mesh = new THREE.Mesh(geometry, mat)
	mesh.name = name
	return mesh
}
function batchBatchedPair(): { groupB: THREE.Group; meshB: THREE.Mesh; batched: any } {
	const root = new THREE.Group()
	root.name = 'table'
	const mockTable = {
		getMovables: () => [],
		getAnimatables: () => [],
		getSurfaceHeight: () => 0,
		getScaleZ: () => 1,
		primitives: {},
		rubbers: {},
		lights: {},
		flashers: {},
		textboxes: {},
		getDimensions: () => ({ width: 100, height: 100 }),
	}
	const matA = new THREE.MeshStandardMaterial({ color: 0x112233 })
	matA.name = 'material:shared'
	const matB = matA.clone()
	matB.name = 'material:shared'
	const groupA = new THREE.Group()
	groupA.name = 'kicker1'
	groupA.add(makeMesh('kicker-kicker1', new THREE.BoxGeometry(10, 10, 1, 4, 4, 4), matA))
	const groupB = new THREE.Group()
	groupB.name = 'kicker2'
	const meshB = makeMesh('kicker-kicker2', new THREE.BoxGeometry(10, 10, 1, 4, 4, 4), matB) as THREE.Mesh
	groupB.add(meshB)
	root.add(groupA)
	root.add(groupB)
	root.updateMatrixWorld(true)
	const api = { getMapGenerator: () => ({ getCache: () => new Map() }), getMaterialGenerator: () => ({}) }
	const buckets = batchStaticOpaques(root, mockTable as unknown as Table, api as unknown as ThreeRenderApi)
	expect(buckets).to.equal(1)
	expect(meshB.visible).to.equal(false)
	let batched: any
	root.traverse(o => {
		if ((o as any).isBatchedMesh) batched = o
	})
	expect(batched, 'a BatchedMesh must own the pair').to.not.equal(undefined)
	return { groupB, meshB, batched }
}
describe('regression: artifact harness', () => {
	it('BM shared-material meshes stay visible and base hidden before streaming', () => {
		const root = new THREE.Group()
		root.name = 'table'
		const sharedMat = new THREE.MeshStandardMaterial({ color: 0xffffff })
		sharedMat.name = 'material:VLM.Bake.Active'
		sharedMat.userData.__isBaked = true
		sharedMat.userData.__addBlend = false
		sharedMat.userData.pendingMap = 'vlm.nestmap0'
		sharedMat.emissive = new THREE.Color(0xffffff)
		sharedMat.emissiveIntensity = 1
		for (let i = 0; i < 5; i++) {
			const geom = new THREE.PlaneGeometry(20, 20)
			const mesh = makeMesh(`primitive-BM_Playfield_Test${i}`, geom, sharedMat)
			root.add(mesh)
		}
		const baseMat = new THREE.MeshStandardMaterial({ color: 0xffffff })
		baseMat.name = 'Playfield'
		const baseGeom = new THREE.PlaneGeometry(20, 20)
		const base = makeMesh('playfield_base', baseGeom, baseMat)
		root.add(base)
		root.updateMatrixWorld(true)
		postProcessScene(root, { harnessLog: () => {}, viewerMode: 'viewer' })
		const bms = root.children.filter(c => c.name.includes('BM_Playfield_Test'))
		for (const bm of bms) expect(bm.visible).to.equal(true)
		expect(base.visible).to.equal(false)
	})
	it('BatchedMesh must not batch baked materials', async () => {
		const root = new THREE.Group()
		root.name = 'table'
		const mockTable = {
			getMovables: () => [],
			getAnimatables: () => [],
			getSurfaceHeight: () => 0,
			getScaleZ: () => 1,
			primitives: { testPrim: { data: { staticRendering: true }, getName: () => 'testPrim' } },
			rubbers: {},
			lights: {},
			flashers: {},
			textboxes: {},
			getDimensions: () => ({ width: 100, height: 100 }),
		}
		const bakedMat = new THREE.MeshStandardMaterial({ color: 0xffffff })
		bakedMat.name = 'material:Bake'
		bakedMat.userData.__isBaked = true
		bakedMat.userData.__addBlend = false
		bakedMat.map = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
		bakedMat.map.name = 'vlm.nestmap0'
		bakedMat.polygonOffset = false
		const bakedGeom = new THREE.BoxGeometry(10, 10, 1)
		const bakedMesh = makeMesh('primitive-BM_armp0', bakedGeom, bakedMat)
		bakedMesh.position.set(0, 0, 0)
		bakedMesh.updateMatrixWorld(true)
		root.add(bakedMesh)
		const woodMat = new THREE.MeshStandardMaterial({ color: 0x8b4513 })
		woodMat.name = 'Wood'
		woodMat.roughness = 0.8
		const woodGeom = new THREE.BoxGeometry(10, 10, 1)
		const woodMesh1 = makeMesh('primitive-wood1', woodGeom, woodMat)
		woodMesh1.position.set(20, 0, 0)
		woodMesh1.updateMatrixWorld(true)
		const woodMesh2 = makeMesh('primitive-wood2', woodGeom.clone(), woodMat.clone())
		woodMesh2.material.name = 'Wood'
		woodMesh2.position.set(40, 0, 0)
		woodMesh2.updateMatrixWorld(true)
		root.add(woodMesh1)
		root.add(woodMesh2)
		root.updateMatrixWorld(true)
		expect(bakedMesh.visible).to.equal(true)
		const api = { getMapGenerator: () => ({ getCache: () => new Map() }), getMaterialGenerator: () => ({}) }
		const res = batchStaticOpaques(root, mockTable as unknown as Table, api as unknown as ThreeRenderApi)
		expect(bakedMesh.visible).to.equal(true)
		let batchedBaked = false
		root.traverse(o => {
			const candidate = o as THREE.Object3D & {
				isBatchedMesh?: boolean
				isInstancedMesh?: boolean
				material?: { name?: string; userData?: Record<string, unknown> }
			}
			if (candidate.isBatchedMesh || candidate.isInstancedMesh) {
				const matName = (candidate.material?.name || '').toLowerCase()
				if (matName.includes('bake') || candidate.material?.userData?.__isBaked) batchedBaked = true
			}
		})
		expect(batchedBaked).to.equal(false)
	})
	it('transparent meshes must never batch, even in low-quality mode', () => {
		const root = new THREE.Group()
		root.name = 'table'
		const mockTable = {
			getMovables: () => [],
			getAnimatables: () => [],
			getSurfaceHeight: () => 0,
			getScaleZ: () => 1,
			primitives: {},
			rubbers: {},
			lights: {},
			flashers: {},
			textboxes: {},
			getDimensions: () => ({ width: 100, height: 100 }),
		}
		const makeGlass = () => {
			const glassMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.5 })
			glassMat.name = 'glass'
			return glassMat
		}
		const nearMesh = makeMesh('primitive-glass-near', new THREE.BoxGeometry(10, 10, 1, 4, 4, 4), makeGlass())
		nearMesh.position.set(0, 0, 10)
		const farMesh = makeMesh('primitive-glass-far', new THREE.BoxGeometry(10, 10, 1, 4, 4, 4), makeGlass())
		farMesh.position.set(0, 0, 100)
		root.add(nearMesh)
		root.add(farMesh)
		root.updateMatrixWorld(true)
		const api = { getMapGenerator: () => ({ getCache: () => new Map() }), getMaterialGenerator: () => ({}) }
		const hadWindow = 'window' in globalThis
		const hadLocation = 'location' in globalThis
		const prevWindow = (globalThis as any).window
		const prevLocation = (globalThis as any).location
		try {
			;(globalThis as any).window = { innerWidth: 1920, innerHeight: 1080 }
			;(globalThis as any).location = { search: '?quality=low' }
			_resetQualityCache()
			expect(isLowQuality()).to.equal(true)
			expect(canBatch(makeGlass())).to.equal(false)
			const buckets = batchStaticOpaques(root, mockTable as unknown as Table, api as unknown as ThreeRenderApi)
			expect(buckets).to.equal(0)
			expect(nearMesh.visible).to.equal(true)
			expect(farMesh.visible).to.equal(true)
			let batchedAny = false
			root.traverse(o => {
				if ((o as any).isBatchedMesh || (o as any).isInstancedMesh) batchedAny = true
			})
			expect(batchedAny).to.equal(false)
		} finally {
			if (hadWindow) (globalThis as any).window = prevWindow
			else delete (globalThis as any).window
			if (hadLocation) (globalThis as any).location = prevLocation
			else delete (globalThis as any).location
			_resetQualityCache()
		}
	})
	it('script material writes must unbatch the hidden original', () => {
		// Kickers batch (not movable/animatable) and take unconditional script
		// material state, so a write must restore the original and hide the stale copy.
		const { groupB, meshB, batched } = batchBatchedPair()
		const slot = meshB.userData.__batched.instanceId as number
		const table = new TableBuilder().addMaterial('newMat', { baseColor: 0xff0000 }).build()
		const api = new ThreeRenderApi({ applyMaterials: true } as any)
		api.applyMaterial(groupB, table.getMaterial('newMat'))
		expect(meshB.visible, 'written mesh must become visible').to.equal(true)
		expect(meshB.userData.__batched, 'write must release the batch slot').to.equal(undefined)
		expect(batched.getVisibleAt(slot), 'stale batch copy must hide').to.equal(false)
		expect((meshB.material as THREE.MeshStandardMaterial).color.getHex()).to.equal(0xff0000)
	})
	it('script mesh writes must unbatch the hidden original', () => {
		const { meshB, batched } = batchBatchedPair()
		const slot = meshB.userData.__batched.instanceId as number
		const vertCount = (meshB.geometry as THREE.BufferGeometry).getAttribute('position').count
		const verts: number[][] = []
		for (let vertIndex = 0; vertIndex < vertCount; vertIndex++) verts.push([vertIndex, 0, 0, 0, 0, 1, 0, 0])
		const api = new ThreeRenderApi({ applyMaterials: true } as any)
		api.applyMeshToNode(Mesh.fromArray(verts, []), meshB)
		expect(meshB.visible, 'written mesh must become visible').to.equal(true)
		expect(meshB.userData.__batched, 'write must release the batch slot').to.equal(undefined)
		expect(batched.getVisibleAt(slot), 'stale batch copy must hide').to.equal(false)
	})
	it.skipIf(!walkingDeadVpx)('underwall playfield surfaces must stay hidden (no vertical artifact)', async () => {
		const vpx = requireWalkingDead()
		const table = await Table.load(new NodeBinaryReader(vpx), { skipTextures: false } as any)
		const api = new ThreeRenderApi({ applyMaterials: true, applyTextures: true, optimizeTextures: false } as any)
		const group = (await (table as any).generateTableNode(api, {
			exportPlayfield: true,
			exportPrimitives: true,
			exportFlippers: true,
			exportBumpers: true,
			exportRamps: true,
			exportSurfaces: true,
			exportRubbers: true,
			exportLightBulbs: true,
			exportHitTargets: true,
			exportGates: true,
			exportKickers: true,
			exportTriggers: true,
			exportSpinners: true,
			exportPlungers: true,
			preloadTextures: false,
		})) as THREE.Group
		group.updateMatrixWorld(true)
		postProcessScene(group, { harnessLog: () => {}, viewerMode: 'viewer' })
		let underwallVisible = 0
		group.traverse(o => {
			if (!(o as THREE.Mesh).isMesh || !o.visible) return
			if ((o.name || '').toLowerCase().includes('playfield_underwall')) underwallVisible++
		})
		expect(
			underwallVisible,
			'Playfield_underwall surfaces must stay hidden (hidden collision, not forced visible) to avoid vertical dark lines',
		).to.equal(0)
	})
	it('no z-fighting: base playfield hidden when baked ready, only baked visible', () => {
		const root = new THREE.Group()
		root.name = 'table'
		const baseMat = new THREE.MeshStandardMaterial({ color: 0xffffff })
		baseMat.name = 'Playfield'
		const baseGeom = new THREE.BoxGeometry(20, 20, 0.5)
		const base = makeMesh('playfield_base', baseGeom, baseMat)
		base.position.set(0, 0, 0)
		root.add(base)
		const bakedMat = new THREE.MeshStandardMaterial({ color: 0x000000 })
		bakedMat.name = 'material:VLM.Bake.Active'
		const tex = new THREE.DataTexture(new Uint8Array([10, 10, 10, 255]), 1, 1)
		tex.name = 'vlm.nestmap0'
		bakedMat.map = tex
		bakedMat.userData.__isBaked = true
		bakedMat.userData.__addBlend = false
		const bakedGeom = new THREE.PlaneGeometry(20, 20)
		const baked = makeMesh('primitive-BM_Playfield', bakedGeom, bakedMat)
		baked.position.set(0, 0, 0.01)
		root.add(baked)
		const pendingMat = new THREE.MeshStandardMaterial({ color: 0xffffff })
		pendingMat.name = 'material:VLM.Bake.Active'
		pendingMat.userData.__isBaked = true
		pendingMat.userData.__addBlend = false
		pendingMat.userData.pendingMap = 'vlm.nestmap0'
		pendingMat.emissive = new THREE.Color(0xffffff)
		pendingMat.emissiveIntensity = 1
		const pendingGeom = new THREE.PlaneGeometry(20, 20)
		const pending = makeMesh('primitive-BM_Playfield_Bumper1', pendingGeom, pendingMat)
		pending.position.set(0, 0, 0.02)
		root.add(pending)
		root.updateMatrixWorld(true)
		postProcessScene(root, { harnessLog: () => {}, viewerMode: 'viewer' })
		expect(baked.visible).to.equal(true)
		expect(pending.visible).to.equal(true)
		expect(base.visible).to.equal(false)
		const visibleMeshes = root.children.filter(m => (m as THREE.Mesh).isMesh === true && m.visible)
		expect(visibleMeshes.length).to.equal(2)
	})
	it.skipIf(!walkingDeadVpx)('ramp BM stays visible before streaming (no dark hole)', async () => {
		const vpx = requireWalkingDead()
		const table = await Table.load(new NodeBinaryReader(vpx), { skipTextures: false } as any)
		const api = new ThreeRenderApi({ applyMaterials: true, applyTextures: true, optimizeTextures: false } as any)
		const group = (await (table as any).generateTableNode(api, {
			exportPlayfield: true,
			exportPrimitives: true,
			exportFlippers: true,
			exportBumpers: true,
			exportRamps: true,
			exportSurfaces: true,
			exportRubbers: true,
			exportLightBulbs: true,
			exportHitTargets: true,
			exportGates: true,
			exportKickers: true,
			exportTriggers: true,
			exportSpinners: true,
			exportPlungers: true,
			preloadTextures: false,
		})) as THREE.Group
		group.updateMatrixWorld(true)
		postProcessScene(group, { harnessLog: () => {}, viewerMode: 'viewer' })
		let rampBMVisible = 0,
			rampBMHidden = 0
		group.traverse(o => {
			if (!(o as THREE.Mesh).isMesh) return
			const n = (o.name || '').toLowerCase()
			if (n.includes('bm_') && (n.includes('armp') || n.includes('botramp') || n.includes('rampscrw'))) {
				if (o.visible) rampBMVisible++
				else rampBMHidden++
			}
		})
		expect(
			rampBMVisible,
			'ramp BM (BotRamp/armp) must stay visible before streaming, not dark hole',
		).to.be.greaterThan(0)
		expect(rampBMHidden).to.equal(0)
	})
	it('polygonOffsetFactor must be negative for baked and overlay materials to prevent z-fighting stripes', () => {
		const root = new THREE.Group()
		root.name = 'table'
		const mainMat = new THREE.MeshStandardMaterial({ color: 0x000000 })
		mainMat.name = 'material:VLM.Bake.Active'
		mainMat.userData.__isBaked = true
		mainMat.userData.__addBlend = false
		const mainMesh = makeMesh('primitive-BM_Playfield', new THREE.PlaneGeometry(20, 20), mainMat)
		root.add(mainMesh)

		const overlayMat = new THREE.MeshStandardMaterial({ color: 0xffffff })
		overlayMat.name = 'material:VLM.Bake.Active'
		overlayMat.userData.__isBaked = true
		overlayMat.userData.__addBlend = true
		const overlayMesh = makeMesh('primitive-LM_flsh20_Playfield', new THREE.PlaneGeometry(20, 20), overlayMat)
		root.add(overlayMesh)

		root.updateMatrixWorld(true)
		postProcessScene(root, { harnessLog: () => {}, viewerMode: 'play' })

		root.traverse(o => {
			if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).material) {
				const mats = Array.isArray((o as THREE.Mesh).material)
					? ((o as THREE.Mesh).material as THREE.Material[])
					: [(o as THREE.Mesh).material as THREE.Material]
				for (const m of mats) {
					const mat = m as THREE.MeshStandardMaterial
					if (mat.polygonOffset) {
						const isOverlay = o.name.toLowerCase().includes('lm_')
						if (isOverlay) {
							expect(
								mat.polygonOffsetFactor,
								`polygonOffsetFactor on overlay ${o.name} must be -2`,
							).to.equal(-2)
							expect(
								mat.polygonOffsetUnits,
								`polygonOffsetUnits on overlay ${o.name} must be -4`,
							).to.equal(-4)
						} else {
							expect(
								mat.polygonOffsetFactor,
								`polygonOffsetFactor on main ${o.name} must be -1`,
							).to.equal(-1)
							expect(mat.polygonOffsetUnits, `polygonOffsetUnits on main ${o.name} must be -1`).to.equal(
								-1,
							)
						}
					}
				}
			}
		})
	})
	it('lightmap overlays (LM_flsh*, LM_insrt*) must initialize with opacity 0 to prevent overlay artifact striping', () => {
		const root = new THREE.Group()
		root.name = 'table'
		const overlayMat = new THREE.MeshStandardMaterial({ color: 0x000000 })
		overlayMat.name = 'material:VLM.Bake.Active'
		overlayMat.userData.__isBaked = true
		overlayMat.userData.__addBlend = true
		const overlayMesh = makeMesh('primitive-LM_flsh26_Playfield', new THREE.PlaneGeometry(20, 20), overlayMat)
		root.add(overlayMesh)

		root.updateMatrixWorld(true)
		postProcessScene(root, { harnessLog: () => {}, viewerMode: 'play' })

		const m = overlayMesh.material as THREE.MeshStandardMaterial
		expect(m.opacity, 'Overlay lightmap opacity must be 0 until activated').to.equal(0)
		expect(m.emissiveIntensity, 'Overlay lightmap emissiveIntensity must be 0 until activated').to.equal(0)
	})
	it('VR room meshes and VR cabinet meshes must remain available in play and viewer modes', () => {
		const root = new THREE.Group()
		root.name = 'table'
		const roomMat = new THREE.MeshStandardMaterial({ color: 0x888888 })
		roomMat.name = 'material:_noXtraShadinglight'
		const roomMesh = makeMesh('primitive-VR_MegaWall005', new THREE.BoxGeometry(100, 10, 100), roomMat)
		roomMesh.visible = true
		root.add(roomMesh)

		const cabMat = new THREE.MeshStandardMaterial({ color: 0x111111 })
		cabMat.name = 'material:colormaxnoreflectionhalf'
		const cabMesh = makeMesh('primitive-VRCab_Cabinet', new THREE.BoxGeometry(50, 50, 50), cabMat)
		cabMesh.visible = false
		root.add(cabMesh)

		root.updateMatrixWorld(true)
		postProcessScene(root, { harnessLog: () => {}, viewerMode: 'play' })

		expect(roomMesh.visible, 'VR_MegaWall005 room mesh should remain visible in play mode').to.equal(true)
		expect(cabMesh.visible, 'VRCab_Cabinet must remain visible').to.equal(true)
	})
	it.skipIf(!walkingDeadVpx)(
		'TWD lightmap overlays on playfield must have opacity 0 initially when loading real table',
		async () => {
			const vpx = requireWalkingDead()
			const table = await Table.load(new NodeBinaryReader(vpx), { skipTextures: false } as any)
			const api = new ThreeRenderApi({
				applyMaterials: true,
				applyTextures: true,
				optimizeTextures: false,
			} as any)
			const group = (await (table as any).generateTableNode(api, {
				exportPlayfield: true,
				exportPrimitives: true,
				exportFlippers: true,
				exportBumpers: true,
				exportRamps: true,
				exportSurfaces: true,
				exportRubbers: true,
				exportLightBulbs: true,
				exportHitTargets: true,
				exportGates: true,
				exportKickers: true,
				exportTriggers: true,
				exportSpinners: true,
				exportPlungers: true,
				preloadTextures: false,
			})) as THREE.Group
			group.updateMatrixWorld(true)
			postProcessScene(group, { harnessLog: () => {}, viewerMode: 'play' })
			let bmPlayfieldVisible = false
			let pfMeshVisible = false
			let vrMeshCount = 0
			let brightOverlayCount = 0
			group.traverse(o => {
				const mesh = o as THREE.Mesh
				if (!mesh.isMesh) return
				const n = (o.name || '').toLowerCase()
				if (n === 'primitive-bm_playfield') bmPlayfieldVisible = o.visible
				if (n === 'primitive-playfield_mesh') pfMeshVisible = o.visible
				if (o.visible && (n.includes('vr_mega') || n.includes('vr_mini'))) vrMeshCount++
				if (o.visible && (n.includes('lm_flsh') || n.includes('lm_insrt'))) {
					const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
					if (mat && mat.opacity > 0) brightOverlayCount++
				}
			})
			expect(bmPlayfieldVisible, 'BM_Playfield must remain visible as solid playfield').to.equal(true)
			expect(pfMeshVisible, 'playfield_mesh must be hidden to prevent z-fighting').to.equal(false)
			expect(vrMeshCount, 'VR room meshes must remain visible').to.be.greaterThan(10)
			expect(
				brightOverlayCount,
				'LM_flsh* and LM_insrt* overlay meshes must not be lit at full opacity initially',
			).to.equal(0)
		},
	)
})

describe('ThreeConverter.createMesh mapping', () => {
	function makeConverter(): ThreeConverter {
		return new ThreeConverter(
			new ThreeMeshGenerator(),
			{ getInitialMaterial: () => new THREE.MeshStandardMaterial() } as any,
			{},
		)
	}
	const box = () => new THREE.BoxGeometry(1, 1, 1)

	it('maps renderOrder from bulbGlow and depthBias with DMD clamps', () => {
		const converter = makeConverter()
		expect(converter.createMesh({ isVisible: true, geometry: box() } as any).renderOrder, 'default').to.equal(0)
		expect(
			converter.createMesh({
				isVisible: true,
				geometry: box(),
				bulbGlow: { color: 0xffffff },
				depthBias: 5,
			} as any).renderOrder,
			'bulb glow wins over depthBias',
		).to.equal(10)
		expect(converter.createMesh({ isVisible: true, geometry: box(), depthBias: 5 } as any).renderOrder).to.equal(-5)
		expect(
			converter.createMesh({ isVisible: true, geometry: box(), depthBias: 2.4 } as any).renderOrder,
			'fractional bias rounds',
		).to.equal(-2)
		expect(
			converter.createMesh({ isVisible: true, geometry: box(), depthBias: -20 } as any).renderOrder,
			'upper clamp',
		).to.equal(15)
		expect(
			converter.createMesh({ isVisible: true, geometry: box(), depthBias: 20000 } as any).renderOrder,
			'DMD lower clamp',
		).to.equal(-10000)
		expect(
			converter.createMesh({ isVisible: true, geometry: box(), depthBias: 0 } as any).renderOrder,
			'zero bias leaves the default',
		).to.equal(0)
		expect(
			converter.createMesh({ isVisible: true, geometry: box(), depthBias: 5, material: { name: 'ball' } } as any)
				.renderOrder,
			'ball wins over bias',
		).to.equal(1)
	})

	it('overrides depthWrite from RenderInfo and leaves it alone when unset', () => {
		const converter = makeConverter()
		const off = converter.createMesh({ isVisible: true, geometry: box(), depthWrite: false } as any)
		expect((off.material as THREE.MeshStandardMaterial).depthWrite).to.equal(false)
		const untouched = converter.createMesh({ isVisible: true, geometry: box() } as any)
		expect((untouched.material as THREE.MeshStandardMaterial).depthWrite).to.equal(true)
	})

	it('throws when neither mesh nor geometry is provided', () => {
		const converter = makeConverter()
		expect(() => converter.createMesh({ isVisible: true } as any)).to.throw(
			'Mesh export must either provide mesh or geometry.',
		)
	})
})

describe('ThreeMeshGenerator.convertToBufferGeometry known answers', () => {
	it('maps positions and normals verbatim and flips v', () => {
		const generator = new ThreeMeshGenerator()
		const mesh = Mesh.fromArray(
			[
				[0, 0, 0, 1, 0, 0, 0.25, 0.25],
				[1, 0, 0, 0, 1, 0, 0.5, 0.5],
				[0, 1, 0, 0, 0, 1, 1, 1],
			],
			[0, 1, 2],
		)
		const geometry = generator.convertToBufferGeometry(mesh)
		expect(Array.from(geometry.getAttribute('position').array)).to.deep.equal([0, 0, 0, 1, 0, 0, 0, 1, 0])
		expect(Array.from(geometry.getAttribute('normal').array)).to.deep.equal([1, 0, 0, 0, 1, 0, 0, 0, 1])
		expect(Array.from(geometry.getAttribute('uv').array)).to.deep.equal([0.25, 0.75, 0.5, 0.5, 1, 0])
		const index = geometry.getIndex()
		expect(index).to.not.equal(null)
		expect(Array.from((index as THREE.BufferAttribute).array)).to.deep.equal([0, 1, 2])
	})

	it('computes exact face normals when the mesh carries none', () => {
		const generator = new ThreeMeshGenerator()
		const mesh = Mesh.fromArray(
			[
				[0, 0, 0, 0, 0, 0, 0, 0],
				[1, 0, 0, 0, 0, 0, 1, 0],
				[0, 1, 0, 0, 0, 0, 0, 1],
			],
			[0, 1, 2],
		)
		const geometry = generator.convertToBufferGeometry(mesh)
		expect(Array.from(geometry.getAttribute('normal').array)).to.deep.equal([0, 0, 1, 0, 0, 1, 0, 0, 1])
	})
})

describe('ThreeRenderApi.applyMeshToNode geometry paths', () => {
	const quadA = [
		[0, 0, 0, 0, 0, 1, 0, 0],
		[1, 0, 0, 0, 0, 1, 1, 0],
		[1, 1, 0, 0, 0, 1, 1, 1],
		[0, 1, 0, 0, 0, 1, 0, 1],
	]
	const quadB = [
		[5, 5, 5, 1, 0, 0, 0, 0],
		[6, 5, 5, 1, 0, 0, 1, 0],
		[6, 6, 5, 1, 0, 0, 1, 1],
		[5, 6, 5, 1, 0, 0, 0, 1],
	]
	function destMeshFor(verts: number[][]): THREE.Mesh {
		const geometry = new ThreeMeshGenerator().convertToBufferGeometry(Mesh.fromArray(verts, [0, 1, 2, 0, 2, 3]))
		return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial())
	}

	it('copies positions and normals in place for matching counts', () => {
		const api = new ThreeRenderApi()
		const dest = destMeshFor(quadA)
		api.applyMeshToNode(Mesh.fromArray(quadB, []), dest)
		expect(Array.from((dest.geometry.getAttribute('position') as THREE.BufferAttribute).array)).to.deep.equal([
			5, 5, 5, 6, 5, 5, 6, 6, 5, 5, 6, 5,
		])
		expect(Array.from((dest.geometry.getAttribute('normal') as THREE.BufferAttribute).array)).to.deep.equal([
			1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
		])
	})

	it('throws when the vertex counts mismatch', () => {
		const api = new ThreeRenderApi()
		const dest = destMeshFor(quadA)
		expect(() => api.applyMeshToNode(Mesh.fromArray([...quadB, [0, 0, 0, 0, 0, 1, 0, 0]], []), dest)).to.throw(
			'Trying to apply geometry',
		)
	})

	it('adds normals when the destination has none', () => {
		const api = new ThreeRenderApi()
		const geometry = new THREE.BufferGeometry()
		geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3))
		const dest = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial())
		api.applyMeshToNode(Mesh.fromArray(quadB, []), dest)
		const normal = dest.geometry.getAttribute('normal') as THREE.BufferAttribute
		expect(normal, 'normal attribute must be added').to.not.equal(undefined)
		expect(Array.from(normal.array)).to.deep.equal([1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0])
	})

	it('recomputes normals when the destination normal count disagrees', () => {
		const api = new ThreeRenderApi()
		const dest = destMeshFor(quadA)
		dest.geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 3))
		let recomputed = 0
		const original = dest.geometry.computeVertexNormals.bind(dest.geometry)
		dest.geometry.computeVertexNormals = () => {
			recomputed++
			return original()
		}
		api.applyMeshToNode(Mesh.fromArray(quadB, []), dest)
		expect(recomputed, 'stale normals must be recomputed').to.equal(1)
	})

	it('rebuilds the BVH after applying geometry', () => {
		const api = new ThreeRenderApi()
		const dest = destMeshFor(quadA)
		let disposed = 0
		const computed: unknown[] = []
		const bvhGeometry = dest.geometry as unknown as Record<string, unknown>
		bvhGeometry.boundsTree = {}
		bvhGeometry.disposeBoundsTree = () => {
			disposed++
		}
		bvhGeometry.computeBoundsTree = (opts: unknown) => {
			computed.push(opts)
		}
		api.applyMeshToNode(Mesh.fromArray(quadB, []), dest)
		expect(disposed).to.equal(1)
		expect(computed).to.deep.equal([{}])
	})
})
