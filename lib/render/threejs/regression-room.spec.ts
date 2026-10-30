import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { createVrMaterialResolver } from './baked-materials.js'
import { createUnshadedBakedNodeMaterial } from './nodes/unshaded-baked-node.js'
import { isShowcaseRoomNode } from './scene-classify.js'
import { classify, isBakedPlayfield, isBasePlayfield, postProcessScene } from './three-scene-postprocess.js'
import { hasBakedPlayfield } from './visibility-heuristics.js'

function makeMesh(name: string, geom: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
	const m = new THREE.Mesh(geom as any, mat as any)
	m.name = name
	return m
}

describe('regression: room must remain visible', () => {
	it('isBasePlayfield must be tight: only playfield name + not baked', () => {
		const bakedClass = { isBakedMat: true } as any
		const unbaked = { isBakedMat: false } as any
		expect(isBasePlayfield('playfield_base', unbaked), 'playfield unbaked is base').toEqual(true)
		expect(isBasePlayfield('primitive-playfield_mesh', unbaked), 'playfield_mesh is base').toEqual(true)
		// bm_playfield is never the base: it is the baked overlay (or an unbaked
		// author mesh) — only the two engine base names count.
		expect(isBasePlayfield('primitive-bm_playfield', bakedClass), 'baked bm should NOT be base').toEqual(false)
		expect(isBasePlayfield('primitive-bm_playfield', unbaked), 'unbaked bm is NOT base either').toEqual(false)
		// Narrowed: author meshes merely containing `playfield` are not the base.
		expect(isBasePlayfield('primitive-playfield_wall', unbaked), 'playfield_wall is NOT base').toEqual(false)
		expect(isBasePlayfield('Playfield_Base', unbaked), 'match is case-insensitive').toEqual(true)
		// Room must NOT be base
		expect(isBasePlayfield('primitive-vr_megawall005', unbaked), 'VR room must not be base').toEqual(false)
		expect(isBasePlayfield('primitive-vrcab_cabinet', unbaked), 'cabinet must not be base').toEqual(false)
		expect(isBasePlayfield('primitive-blackbox', unbaked), 'blackbox not base').toEqual(false)
		expect(isBasePlayfield('table', unbaked), 'table not playfield').toEqual(false)
		// old bug: matName includes playfield or parentName includes table would hide room
		expect(isBasePlayfield('some_wall', unbaked), 'wall not base').toEqual(false)
	})

	it('classify must correctly mark baked vs not', () => {
		const c1 = classify('primitive-bm_playfield', 'material:vlm.bake.active', 'vlm.nestmap0', true, false)
		expect(c1.isBakedMat, 'baked flag true').toEqual(true)
		expect(c1.isMainBake).toEqual(true)
		const c2 = classify('primitive-vr_megawall005', 'material:vr_wall', 'vr_travertine', false, false)
		expect(c2.isBakedMat, 'VR not baked').toEqual(false)
		expect(c2.isVr, 'VR true').toEqual(true)
		const c3 = classify('primitive-vrcab_cabinet', 'material:cabinet', '', false, false)
		expect(c3.isCab, 'cab true').toEqual(true)
	})

	it('postProcessScene must keep VR, cabinet and bm_playfield while hiding dark occluders', () => {
		const root = new THREE.Group()
		root.name = 'table'
		// BM baked main
		const bmMat = new THREE.MeshStandardMaterial({ color: 0x000000 })
		bmMat.name = 'material:VLM.Bake.Active'
		const tex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
		tex.name = 'vlm.nestmap0'
		bmMat.map = tex as any
		;(bmMat.userData as any).__isBaked = true
		const bm = makeMesh('primitive-bm_playfield', new THREE.PlaneGeometry(20, 20), bmMat)
		root.add(bm)
		// VR room
		const vrMat = new THREE.MeshStandardMaterial({ color: 0x888888 })
		vrMat.name = 'material:vr_wall'
		const vr = makeMesh('primitive-vr_megawall005', new THREE.BoxGeometry(10, 10, 10), vrMat)
		root.add(vr)
		// Cabinet
		const cabMat = new THREE.MeshStandardMaterial({ color: 0x111111 })
		cabMat.name = 'material:cabinet'
		const cab = makeMesh('primitive-vrcab_cabinet', new THREE.BoxGeometry(10, 10, 10), cabMat)
		// blackbox (should be hidden as dark occluder)
		const bbMat = new THREE.MeshStandardMaterial({ color: 0x010101 })
		bbMat.name = 'black'
		const bb = makeMesh('primitive-blackbox', new THREE.BoxGeometry(100, 100, 10), bbMat)
		root.add(cab)
		root.add(bb)

		root.updateMatrixWorld(true)
		postProcessScene(root, { harnessLog: () => {}, viewerMode: 'viewer' })

		expect(bm.visible, 'BM_Playfield must stay visible').toEqual(true)
		expect(vr.visible, 'VR room must remain visible').toEqual(true)
		expect(cab.visible, 'cabinet must remain visible').toEqual(true)
		expect(bb.visible, 'blackbox large dark occluder must be hidden').toEqual(false)
	})

	it('without BM, base playfield must stay visible', () => {
		const root = new THREE.Group()
		const baseMat = new THREE.MeshStandardMaterial({ color: 0xffffff })
		baseMat.name = 'Playfield'
		const base = makeMesh('playfield_base', new THREE.PlaneGeometry(20, 20), baseMat)
		root.add(base)
		const vrMat = new THREE.MeshStandardMaterial({ color: 0x888888 })
		const vr = makeMesh('primitive-vr_megawall005', new THREE.BoxGeometry(10, 10, 10), vrMat)
		root.add(vr)
		postProcessScene(root, { harnessLog: () => {} })
		expect(base.visible, 'without baked, base should stay').toEqual(true)
		expect(vr.visible, 'VR stays').toEqual(true)
	})

	it('playfield_mesh hiding must be generic (only that name)', () => {
		const root = new THREE.Group()
		const m = new THREE.MeshStandardMaterial({ color: 0xffffff })
		const a = makeMesh('primitive-playfield_mesh', new THREE.PlaneGeometry(5, 5), m)
		const b = makeMesh('primitive-playfield_wall', new THREE.PlaneGeometry(5, 5), m.clone())
		root.add(a)
		root.add(b)
		const bmMat = new THREE.MeshStandardMaterial({ color: 0x000000 })
		bmMat.name = 'material:VLM.Bake.Active'
		bmMat.map = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1) as any
		;(bmMat.userData as any).__isBaked = true
		const bm = makeMesh('primitive-bm_playfield', new THREE.PlaneGeometry(5, 5), bmMat)
		root.add(bm)
		postProcessScene(root, { harnessLog: () => {} })
		expect(a.visible, 'playfield_mesh hidden').toEqual(false)
		expect(b.visible, 'playfield_wall is author content and must stay visible').toEqual(true)
		expect(bm.visible, 'bm_playfield baked overlay must stay visible').toEqual(true)
	})

	it('hasBakedPlayfield honors engine bake flags, not the mesh name', () => {
		const unbakedMat = () => {
			const mat = new THREE.MeshStandardMaterial({ color: 0xffffff })
			mat.name = 'Playfield'
			return mat
		}
		const bakedMat = () => {
			const mat = new THREE.MeshStandardMaterial({ color: 0x000000 })
			mat.name = 'material:VLM.Bake.Active'
			;(mat.userData as any).__isBaked = true
			return mat
		}
		// Name alone is not a bake: an unbaked mesh called bm_playfield does not
		// trigger the playfield pass, so the base stays visible.
		const impostor = makeMesh('primitive-bm_playfield', new THREE.PlaneGeometry(5, 5), unbakedMat())
		expect(hasBakedPlayfield([impostor]), 'unbaked bm_playfield is not a bake').toEqual(false)
		const base = makeMesh('playfield_base', new THREE.PlaneGeometry(5, 5), unbakedMat())
		const root = new THREE.Group()
		root.add(base)
		root.add(impostor)
		postProcessScene(root, { harnessLog: () => {} })
		expect(base.visible, 'base stays when the only bm_playfield is unbaked').toEqual(true)
		// Engine flag makes it a bake even with a custom (non-bm_) playfield name.
		const custom = makeMesh('primitive-playfield_custom', new THREE.PlaneGeometry(5, 5), bakedMat())
		expect(hasBakedPlayfield([custom]), 'flagged playfield bake counts').toEqual(true)
	})

	it('VR detection covers unseparated names', () => {
		for (const name of [
			'primitive-vr_megawall005',
			'primitive-vrmega1',
			'vrmega4',
			'vrmeag11',
			'vr_platform',
			'primitive-vrmin_light',
		]) {
			expect(classify(name, '', '', false, false).isVr, `${name} classifies VR`).toEqual(true)
		}
		expect(classify('primitive-vrcab_cabinet', '', '', false, false).isVr, 'cab wins over VR').toEqual(false)
		expect(classify('primitive-vrcab_cabinet', '', '', false, false).isCab, 'cab stays cab').toEqual(true)
		for (const name of ['primitive-vr_cab', 'VR_Cab', 'VR_Backbox', 'VR_Coin_Door', 'BM_VR_Cab_Siderails']) {
			expect(classify(name, '', '', false, false).isCab, `${name} is cabinet`).toEqual(true)
		}
		for (const name of ['cover', 'primitive-chevron', 'primitive-blackbox']) {
			expect(classify(name, '', '', false, false).isVr, `${name} is not VR`).toEqual(false)
		}
	})

	it('unmapped VR room walls survive the wall passes', () => {
		const root = new THREE.Group()
		root.name = 'table'
		const white = makeMesh(
			'primitive-vrmega_wall',
			new THREE.BoxGeometry(200, 200, 60),
			new THREE.MeshStandardMaterial({ color: 0xffffff }),
		)
		const dark = makeMesh(
			'primitive-vrmega_dark',
			new THREE.BoxGeometry(200, 200, 60),
			new THREE.MeshStandardMaterial({ color: 0x000000 }),
		)
		root.add(white)
		root.add(dark)
		root.updateMatrixWorld(true)
		postProcessScene(root, { harnessLog: () => {}, viewerMode: 'viewer' })
		expect(white.visible, 'white VR wall stays').toEqual(true)
		expect(dark.visible, 'dark VR wall stays').toEqual(true)
	})

	it('isShowcaseRoomNode covers the script-hidden room and cabinet names', () => {
		// Royal Flush hides VRCab + ColRoom1/ColRoomMinimal on desktop
		// (`for each Object in VRCab : object.visible = 0`); the showcase
		// viewer keeps exactly these visible.
		for (const name of [
			'VR_Cab',
			'VR_Backbox',
			'VR_Cab_Leg_Front_Right',
			'VR_CabFlipperLeft',
			'VR_Coin_Door',
			'VR_Primary_plunger',
			'VR_Platform',
			'VR_Sphere',
			'VRMega1',
			'VRMeag11',
			'BM_VR_Cab_Siderails',
			'VR_Cab_StartButton',
		]) {
			expect(isShowcaseRoomNode(name), `${name} is showcase room content`).toEqual(true)
		}
		for (const name of ['Playfield', 'primitive-plunger', 'LeftFlipper', 'cover', undefined]) {
			expect(isShowcaseRoomNode(name), `${String(name)} is not room content`).toEqual(false)
		}
	})

	it('getVr keeps baked-node VR materials opaque while maps are pending', () => {
		// The room/cabinet bake their maps after postprocess; zeroing the
		// material here hid them permanently (the map bind later only sets
		// the texture, never opacity). Pre-arrival invisibility still comes
		// from the baked shader's own placeholder alpha.
		const mat = createUnshadedBakedNodeMaterial({ transmission: false })
		;(mat.userData as Record<string, unknown>).pendingMap = 'vr_travertine'
		const out = createVrMaterialResolver()(mat as unknown as THREE.MeshStandardMaterial, 'primitive-vr_megawall005')
		expect(out.opacity, 'baked VR stays opaque until the map binds').toEqual(1)
		expect(out.transparent, 'baked VR is not transparent').toEqual(false)
	})

	it('isBakedPlayfield unifies the bake-side name checks', () => {
		const main = { isMainBake: true } as any
		const overlay = { isMainBake: false } as any
		expect(isBakedPlayfield('primitive-bm_playfield', main), 'bm bake is baked playfield').toEqual(true)
		expect(isBakedPlayfield('primitive-BM_Playfield_Custom', main), 'custom bake name counts').toEqual(true)
		expect(isBakedPlayfield('primitive-bm_playfield', overlay), 'additive overlay is not main bake').toEqual(false)
		expect(isBakedPlayfield('primitive-vr_megawall005', main), 'non-playfield bake is not playfield').toEqual(false)
	})
})
