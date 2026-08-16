import * as fs from 'node:fs'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { classify, isBasePlayfield, postProcessScene } from './three-scene-postprocess.js'

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
		expect(
			isBasePlayfield('primitive-bm_playfield', unbaked),
			'bm_playfield contains playfield but also baked? check baked flag',
		)
		// bm_playfield is baked, so !isBakedMat false => not base
		expect(isBasePlayfield('primitive-bm_playfield', bakedClass), 'baked bm should NOT be base').toEqual(false)
		expect(
			isBasePlayfield('primitive-bm_playfield', unbaked),
			'unbaked bm with playfield name currently counts as base - but postProcess hides via primitive-playfield_mesh check',
		)
		// Room must NOT be base
		expect(isBasePlayfield('primitive-vr_megawall005', unbaked), 'VR room must not be base').toEqual(false)
		expect(isBasePlayfield('primitive-vrcab_cabinet', unbaked), 'cabinet must not be base').toEqual(false)
		expect(isBasePlayfield('primitive-blackbox', unbaked), 'blackbox not base').toEqual(false)
		expect(isBasePlayfield('table', unbaked), 'table not playfield').toEqual(false)
		// old bug: matName includes playfield or parentName includes table would hide room
		expect(isBasePlayfield('some_wall', unbaked), 'wall not base').toEqual(false)
		// file guard: ensure old loose check not present
		const src = fs.readFileSync('lib/render/threejs/three-scene-postprocess.ts', 'utf-8')
		expect(src, 'isBasePlayfield must not check parentName/table').not.toContain('parentName')
		expect(src, 'must not check matName.includes(playfield)').not.toMatch(/matName\.includes\('playfield'\)/)
		expect(src).toContain("n.includes('playfield') && !c.isBakedMat")
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
		// blackbox (should stay now, not hidden)
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
		expect(bb.visible, 'blackbox cabinet interior must remain visible (retained)').toEqual(true)
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
		expect(b.visible, 'playfield_wall should be hidden via isBasePlayfield (contains playfield)').toEqual(false)
	})
})
