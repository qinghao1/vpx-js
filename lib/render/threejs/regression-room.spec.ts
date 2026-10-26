import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
	classify,
	isBakedPlayfield,
	isBasePlayfield,
	isDeferred,
	postProcessScene,
	resolveButtonCode,
	swipeNudge,
} from './three-scene-postprocess.js'
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

	it('postProcessScene must hide base playfield but keep VR and bm_playfield', () => {
		const root = new THREE.Group()
		root.name = 'table'
		// base playfield unbaked
		const baseMat = new THREE.MeshStandardMaterial({ color: 0xffffff })
		baseMat.name = 'Playfield'
		const base = makeMesh('playfield_base', new THREE.PlaneGeometry(20, 20), baseMat)
		root.add(base)
		// second base: primitive-playfield_mesh (default Table1)
		const meshMat = new THREE.MeshStandardMaterial({ color: 0xffffff })
		meshMat.name = 'Playfield'
		const mesh = makeMesh('primitive-playfield_mesh', new THREE.PlaneGeometry(20, 20), meshMat)
		root.add(mesh)
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

		expect(base.visible, 'base playfield must be hidden when BM ready').toEqual(false)
		expect(mesh.visible, 'playfield_mesh must be hidden').toEqual(false)
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

	it('isBakedPlayfield unifies the bake-side name checks', () => {
		const main = { isMainBake: true } as any
		const overlay = { isMainBake: false } as any
		expect(isBakedPlayfield('primitive-bm_playfield', main), 'bm bake is baked playfield').toEqual(true)
		expect(isBakedPlayfield('primitive-BM_Playfield_Custom', main), 'custom bake name counts').toEqual(true)
		expect(isBakedPlayfield('primitive-bm_playfield', overlay), 'additive overlay is not main bake').toEqual(false)
		expect(isBakedPlayfield('primitive-vr_megawall005', main), 'non-playfield bake is not playfield').toEqual(false)
	})

	it('isDeferred correctly prioritizes playfield and bake maps over large assets', () => {
		const table = { getPlayfieldMap: () => 'playfield_image.png' }

		// Exact playfield map is never deferred
		expect(isDeferred({ getName: () => 'playfield_image.png', width: 4096, height: 4096 }, table)).toBe(false)

		// Large bake/nestmap textures are never deferred
		expect(isDeferred({ getName: () => 'vlm_bake_01.png', width: 2048, height: 2048 }, table)).toBe(false)
		expect(isDeferred({ getName: () => 'nestmap_playfield.png', width: 2048, height: 2048 }, table)).toBe(false)

		// HDR/EXR textures are always deferred
		expect(isDeferred({ getName: () => 'env.hdr', szPath: 'env.hdr', width: 512, height: 256 }, table)).toBe(true)
		expect(isDeferred({ getName: () => 'env.exr', szPath: 'env.exr', width: 512, height: 256 }, table)).toBe(true)

		// Large non-bake textures (> 1MP) are deferred
		expect(isDeferred({ getName: () => 'plastic_artwork.png', width: 2048, height: 1024 }, table)).toBe(true)

		// Small textures (<= 1MP) are not deferred
		expect(isDeferred({ getName: () => 'button.png', width: 512, height: 512 }, table)).toBe(false)
	})

	it('resolveButtonCode maps button names to direct input codes', () => {
		expect(resolveButtonCode('coin_door_coin1')).toBe('Digit5')
		expect(resolveButtonCode('start_button')).toBe('Digit1')
		expect(resolveButtonCode('plunger_launch_btn')).toBe('Enter')
		expect(resolveButtonCode('fire_lockbar')).toBe('AltLeft')
		expect(resolveButtonCode('magna_left')).toBe('ControlLeft')
		expect(resolveButtonCode('magna_right')).toBe('ControlRight')
		expect(resolveButtonCode('unknown_primitive')).toBeNull()
	})

	it('swipeNudge determines nudge direction from swipe deltas', () => {
		const NUDGE = { left: 1, right: 2, forward: 3, back: 4 }
		expect(swipeNudge(-50, 5, NUDGE)).toBe(NUDGE.left)
		expect(swipeNudge(50, 5, NUDGE)).toBe(NUDGE.right)
		expect(swipeNudge(5, -50, NUDGE)).toBe(NUDGE.forward)
		expect(swipeNudge(5, 50, NUDGE)).toBe(NUDGE.back)
		expect(swipeNudge(20, 20, NUDGE)).toBeNull()
	})
})
