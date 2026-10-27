// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import * as THREE from 'three'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { Table } from '../../vpt/table/table.js'
import { ThreeRenderApi } from './three-render-api.js'
import { postProcessScene } from './three-scene-postprocess.js'

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

describe('regression: artifact postprocess', () => {
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
	it('hides only untextured green materials (textured green ramps stay visible)', () => {
		const root = new THREE.Group()
		root.name = 'table'
		const greenMat = new THREE.MeshStandardMaterial({ color: 0xffffff })
		greenMat.name = 'material:green plastic'
		const greenMesh = makeMesh('primitive-rampflap', new THREE.BoxGeometry(200, 200, 200), greenMat)
		root.add(greenMesh)

		const texturedGreenMat = new THREE.MeshStandardMaterial({ color: 0xffffff })
		texturedGreenMat.name = 'material:green plastic'
		texturedGreenMat.map = new THREE.Texture()
		texturedGreenMat.map.name = 'green_tex'
		const texturedGreenMesh = makeMesh(
			'primitive-rampright',
			new THREE.BoxGeometry(200, 200, 200),
			texturedGreenMat,
		)
		root.add(texturedGreenMesh)

		const controlMat = new THREE.MeshStandardMaterial({ color: 0x888888 })
		controlMat.name = 'material:screw'
		const controlMesh = makeMesh('primitive-screw', new THREE.BoxGeometry(200, 200, 200), controlMat)
		root.add(controlMesh)

		root.updateMatrixWorld(true)
		const stats = postProcessScene(root, { harnessLog: () => {}, viewerMode: 'viewer' })

		expect(greenMesh.visible, 'untextured green ramp must still hide').to.equal(false)
		expect(texturedGreenMesh.visible, 'textured green ramp must stay visible').to.equal(true)
		expect(controlMesh.visible, 'non-green control must stay visible').to.equal(true)
		expect(stats.greenHidden, 'only the untextured green offender hides').to.equal(1)
	})

	it('exempts only the exact ball material from the metal flattening pass', () => {
		const root = new THREE.Group()
		root.name = 'table'
		const ballMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.08 })
		ballMat.name = 'material:ball'
		const ballMesh = makeMesh('primitive-ball', new THREE.BoxGeometry(200, 200, 200), ballMat)
		root.add(ballMesh)

		const fireballMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.1 })
		fireballMat.name = 'material:fireball'
		const fireballMesh = makeMesh('primitive-playfieldtoy', new THREE.BoxGeometry(200, 200, 200), fireballMat)
		root.add(fireballMesh)

		root.updateMatrixWorld(true)
		const stats = postProcessScene(root, { harnessLog: () => {}, viewerMode: 'viewer' })

		expect(ballMat.metalness, 'exact ball material keeps its metalness').to.equal(1)
		const fixedFireball = fireballMesh.material as THREE.MeshStandardMaterial
		expect(fixedFireball.metalness, 'ball-substring material must flatten like other metals').to.be.lessThan(1)
		expect(stats.metalFixed, 'only the non-ball metal flattens').to.equal(1)
	})

	it('classify keeps vr/cab flags on the mesh name (no per-material disagreement)', () => {
		// isVr/isCab currently derive from the mesh name alone, so OR-reducing
		// classify across a multi-material mesh cannot disagree: this documents
		// the current semantic rather than adding a no-op reduction.
		const vr = makeMesh(
			'primitive-vr_wall',
			new THREE.BoxGeometry(10, 10, 10),
			new THREE.MeshStandardMaterial({ color: 0xffffff }),
		)
		vr.visible = false
		const cab = makeMesh(
			'primitive-vrcab_flipper',
			new THREE.BoxGeometry(10, 10, 10),
			new THREE.MeshStandardMaterial({ color: 0xffffff }),
		)
		cab.visible = false
		const root = new THREE.Group()
		root.name = 'table'
		root.add(vr, cab)
		root.updateMatrixWorld(true)
		const stats = postProcessScene(root, { harnessLog: () => {}, viewerMode: 'viewer' })
		expect(vr.visible, 'vr mesh forces visible in viewer mode').to.equal(true)
		expect(stats.vrKept).to.be.greaterThan(0)
		expect(cab.visible, 'vrcab flipper forces visible in viewer mode').to.equal(true)
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
