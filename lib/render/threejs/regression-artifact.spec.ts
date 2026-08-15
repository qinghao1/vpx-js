// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import * as THREE from 'three'
import { applyBakedMaterial, isBakedMeshByNames, postProcessScene } from '../../../demo-browser/src/scene.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { Table } from '../../vpt/table/table.js'
import { batchStaticOpaques } from './three-batched-builder.js'
import { ThreeRenderApi } from './three-render-api.js'

chai.use((sinonChai as any).default ?? sinonChai)
function makeMesh(name, geometry, mat) {
	const mesh = new THREE.Mesh(geometry, mat)
	mesh.name = name
	return mesh
}
describe('regression: artifact harness', () => {
	it('BM shared-material all become visible after streaming', () => {
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
		const tex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
		tex.name = 'vlm.nestmap0'
		const cache = new Map([['vlm.nestmap0', tex]])
		// simulate patch
		let fixed = 0
		root.traverse(o => {
			if (!o.isMesh || !o.material) return
			const mats = Array.isArray(o.material) ? o.material : [o.material]
			for (const m of mats) {
				const pending = m.userData.pendingMap || m.userData.pendingmap
				if (!pending) continue
				let t = cache.get(pending)
				if (!t)
					for (const [k, v] of cache)
						if (k.toLowerCase() === String(pending).toLowerCase()) {
							t = v
							break
						}
				if (!t) continue
				m.map = t
				t.name = pending
				delete m.userData.pendingMap
				delete m.userData.pendingmap
				m.needsUpdate = true
				const info = isBakedMeshByNames(
					o.name || '',
					m.name || '',
					t.name || '',
					!!m.userData.__isBaked,
					!!m.userData.__addBlend,
				)
				if (info.isBaked) {
					applyBakedMaterial(m, t, info, o.name || '')
					const nl = (o.name || '').toLowerCase()
					const isPlayfieldOverlay = info.isVlmBake && !info.isMainBake && nl.includes('playfield')
					const isBakedMeshName = nl.includes('playfield') || nl.includes('bm_')
					if ((info.isMainBake || isPlayfieldOverlay) && isBakedMeshName) {
						const makeVisible = obj => {
							if (obj.visible === false) {
								obj.visible = true
								for (let pp = obj.parent; pp && pp !== root; pp = pp.parent)
									if (pp.visible === false) pp.visible = true
							}
						}
						makeVisible(o)
						root.traverse(obj2 => {
							if (!obj2.isMesh || obj2 === o) return
							if (obj2.material !== m) return
							const n2 = (obj2.name || '').toLowerCase()
							if (!n2.includes('playfield') && !n2.includes('bm_')) return
							makeVisible(obj2)
						})
					}
				}
				fixed++
			}
		})
		if (fixed) {
			root.traverse(o => {
				if (!o.isMesh) return
				const n2 = (o.name || '').toLowerCase()
				if (!n2.includes('playfield') && !n2.includes('bm_')) return
				const m2 = Array.isArray(o.material) ? o.material[0] : o.material
				if (!m2?.map) return
				const isBaked = !!(m2.userData && m2.userData.__isBaked)
				const info2 = isBakedMeshByNames(
					n2,
					m2.name || '',
					m2.map?.name || '',
					!!m2.userData.__isBaked,
					!!m2.userData.__addBlend,
				)
				const shouldShow = isBaked || info2.isMainBake || (info2.isVlmBake && !info2.isMainBake)
				if (shouldShow && o.visible === false) {
					o.visible = true
					for (let p = o.parent; p && p !== root; p = p.parent) if (p.visible === false) p.visible = true
				}
			})
		}
		let visibleCount = 0
		for (const bm of bms) if (bm.visible) visibleCount++
		expect(visibleCount).to.equal(5)
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
			if (o.isBatchedMesh || o.isInstancedMesh) {
				const matName = (o.material?.name || '').toLowerCase()
				if (matName.includes('bake') || o.material.userData?.__isBaked) batchedBaked = true
			}
		})
		expect(batchedBaked).to.equal(false)
	})
	it('underwall playfield surfaces must stay hidden (no vertical artifact)', async () => {
		const vpxCandidates = [
			path.resolve('walking_dead.vpx'),
			path.join(process.env.HOME || '/home/qinghao1', 'Downloads/walking_dead.vpx'),
		]
		const vpx = vpxCandidates.find(p => {
			try {
				return fs.existsSync(p) && fs.statSync(p).size > 1024 * 1024
			} catch {
				return false
			}
		})
		if (!vpx) return
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
			if (!o.isMesh || !o.visible) return
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
		const visibleMeshes = root.children.filter(m => m.isMesh && m.visible)
		expect(visibleMeshes.length).to.equal(2)
	})
	it('ramp BM stays visible before streaming (no dark hole)', async () => {
		const vpxCandidates = [
			path.resolve('walking_dead.vpx'),
			path.join(process.env.HOME || '/home/qinghao1', 'Downloads/walking_dead.vpx'),
		]
		const vpx = vpxCandidates.find(p => {
			try {
				return fs.existsSync(p) && fs.statSync(p).size > 1024 * 1024
			} catch {
				return false
			}
		})
		if (!vpx) return
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
			if (!o.isMesh) return
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
	it('TWD lightmap overlays on playfield must have opacity 0 initially when loading real table', async () => {
		const vpxCandidates = [
			path.resolve('walking_dead.vpx'),
			path.join(process.env.HOME || '/home/qinghao1', 'Downloads/walking_dead.vpx'),
		]
		const vpx = vpxCandidates.find(p => {
			try {
				return fs.existsSync(p) && fs.statSync(p).size > 1024 * 1024
			} catch {
				return false
			}
		})
		if (!vpx) return
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
		postProcessScene(group, { harnessLog: () => {}, viewerMode: 'play' })
		let bmPlayfieldVisible = false
		let pfMeshVisible = false
		let vrMeshCount = 0
		let brightOverlayCount = 0
		group.traverse(o => {
			if (!o.isMesh) return
			const n = (o.name || '').toLowerCase()
			if (n === 'primitive-bm_playfield') bmPlayfieldVisible = o.visible
			if (n === 'primitive-playfield_mesh') pfMeshVisible = o.visible
			if (o.visible && (n.includes('vr_mega') || n.includes('vr_mini'))) vrMeshCount++
			if (o.visible && (n.includes('lm_flsh') || n.includes('lm_insrt'))) {
				const mat = Array.isArray(o.material) ? o.material[0] : o.material
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
	})
})
