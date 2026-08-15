// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE
import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import * as THREE from 'three'
import { postProcessScene } from '../../../demo-browser/src/scene.js'

chai.use((sinonChai as any).default ?? sinonChai)

function makeMesh(name: string, geometry: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[]): THREE.Mesh {
	const mesh = new THREE.Mesh(geometry, mat as any)
	mesh.name = name
	return mesh
}

describe('regression: playfield baked hide', () => {
	it('hides pending BM when hasReadyBake (bright artifact)', () => {
		const root = new THREE.Group()
		root.name = 'table'

		// base playfield (unbaked)
		const baseMat = new THREE.MeshStandardMaterial({ color: 0xffffff })
		baseMat.name = 'Playfield'
		const baseGeom = new THREE.PlaneGeometry(20, 20)
		const base = makeMesh('playfield_base', baseGeom, baseMat)
		root.add(base)

		// baked BM with ready map (hasReadyBake true)
		const readyMat = new THREE.MeshStandardMaterial({ color: 0x000000 })
		readyMat.name = 'material:VLM.Bake.Active'
		const readyTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
		readyTex.name = 'vlm.nestmap0'
		readyMat.map = readyTex as any
		;(readyMat.userData as any).__isBaked = true
		;(readyMat.userData as any).__addBlend = false
		const readyGeom = new THREE.PlaneGeometry(20, 20)
		const readyBM = makeMesh('primitive-BM_Playfield', readyGeom, readyMat)
		root.add(readyBM)

		// pending BM (same bake, no map yet) — should be hidden to avoid bright white
		const pendingMat = new THREE.MeshStandardMaterial({ color: 0xffffff })
		pendingMat.name = 'material:VLM.Bake.Active'
		;(pendingMat.userData as any).__isBaked = true
		;(pendingMat.userData as any).__addBlend = false
		;(pendingMat.userData as any).pendingMap = 'vlm.nestmap0'
		pendingMat.emissive = new THREE.Color(0xffffff)
		pendingMat.emissiveIntensity = 1
		const pendingGeom = new THREE.PlaneGeometry(20, 20)
		const pendingBM = makeMesh('primitive-BM_Playfield_Bumper1_Ring', pendingGeom, pendingMat)
		root.add(pendingBM)

		root.updateMatrixWorld(true)
		postProcessScene(root, { harnessLog: () => {}, viewerMode: 'viewer' })

		expect(readyBM.visible, 'ready BM must remain visible').to.equal(true)
		expect(pendingBM.visible, 'pending BM must remain visible (streaming will show)').to.equal(true)
		expect(base.visible, 'base playfield must be hidden when baked ready').to.equal(false)
	})

	it('hides pending BM and keeps base visible when only pending (no ready)', () => {
		const root = new THREE.Group()
		const baseMat = new THREE.MeshStandardMaterial({ color: 0xffffff })
		baseMat.name = 'Playfield'
		const baseGeom = new THREE.PlaneGeometry(20, 20)
		const base = makeMesh('playfield_base', baseGeom, baseMat)
		root.add(base)

		const pendingMat = new THREE.MeshStandardMaterial({ color: 0xffffff })
		pendingMat.name = 'material:VLM.Bake.Active'
		;(pendingMat.userData as any).__isBaked = true
		;(pendingMat.userData as any).__addBlend = false
		;(pendingMat.userData as any).pendingMap = 'vlm.nestmap0'
		const pendingGeom = new THREE.PlaneGeometry(20, 20)
		const pendingBM = makeMesh('primitive-BM_Playfield', pendingGeom, pendingMat)
		root.add(pendingBM)

		root.updateMatrixWorld(true)
		postProcessScene(root, { harnessLog: () => {}, viewerMode: 'viewer' })

		expect(pendingBM.visible, 'pending BM must remain visible when hasPendingBake').to.equal(true)
		expect(base.visible, 'base playfield must be hidden when hasPendingBake (baked replaces base)').to.equal(false)
	})

	it('is generic: uses engine addBlend, not name', () => {
		const root = new THREE.Group()
		const readyMat = new THREE.MeshStandardMaterial({ color: 0x000000 })
		readyMat.name = 'material:VLM.Bake.Active'
		const readyTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
		readyTex.name = 'custom_bake_map'
		readyMat.map = readyTex as any
		;(readyMat.userData as any).__isBaked = true
		;(readyMat.userData as any).__addBlend = false
		const readyGeom = new THREE.PlaneGeometry(20, 20)
		const readyBM = makeMesh('primitive-BM_Playfield_Custom', readyGeom, readyMat)
		root.add(readyBM)

		const pendingMat = new THREE.MeshStandardMaterial({ color: 0xffffff })
		pendingMat.name = 'material:VLM.Bake.Active'
		;(pendingMat.userData as any).__isBaked = true
		;(pendingMat.userData as any).__addBlend = false
		;(pendingMat.userData as any).pendingMap = 'custom_bake_map'
		const pendingGeom = new THREE.PlaneGeometry(20, 20)
		const pendingBM = makeMesh('primitive-BM_Playfield_Other', pendingGeom, pendingMat)
		root.add(pendingBM)

		root.updateMatrixWorld(true)
		postProcessScene(root, { harnessLog: () => {} })

		expect(pendingBM.visible, 'pending custom bake must remain visible generically').to.equal(true)
	})

	it('hides pending VR until texture streams (white ghost)', () => {
		const root = new THREE.Group()
		const vrMat = new THREE.MeshStandardMaterial({ color: 0xffffff })
		vrMat.name = '_noXtraShadinglight'
		;(vrMat.userData as any).pendingMap = 'VR_MegaRailing_Bake1_CyclesBake_COMBINED_1'
		vrMat.roughness = 0.5
		const vrGeom = new THREE.PlaneGeometry(20, 20)
		const vrMesh = makeMesh('primitive-VR_MegaRailing', vrGeom, vrMat)
		root.add(vrMesh)

		root.updateMatrixWorld(true)
		postProcessScene(root, { harnessLog: () => {}, viewerMode: 'viewer' })

		const outMat = vrMesh.material as THREE.MeshStandardMaterial
		expect(outMat.transparent, 'pending VR must be transparent').to.equal(true)
		expect(outMat.opacity, 'pending VR must be invisible').to.equal(0)
		expect(outMat.depthWrite, 'pending VR must not write depth').to.equal(false)
	})

	it('hides generic pending insert until texture streams (white ghost)', () => {
		const root = new THREE.Group()
		const mat = new THREE.MeshStandardMaterial({ color: 0xffffff })
		mat.name = 'material:insertrectangle1off'
		;(mat.userData as any).pendingMap = 'insertrectangle1off'
		mat.roughness = 0.5
		const geom = new THREE.PlaneGeometry(20, 20)
		const mesh = makeMesh('primitive-015_Primitive011', geom, mat)
		root.add(mesh)

		root.updateMatrixWorld(true)
		postProcessScene(root, { harnessLog: () => {}, viewerMode: 'viewer' })

		const outMat = mesh.material as THREE.MeshStandardMaterial
		expect(outMat.transparent, 'pending insert must be transparent').to.equal(true)
		expect(outMat.opacity, 'pending insert must be invisible').to.equal(0)
		expect(outMat.depthWrite, 'pending insert must not write depth').to.equal(false)
	})

	it('does not hide large non-insert pending as generic (no frosted overlay)', () => {
		const root = new THREE.Group()
		const mat = new THREE.MeshStandardMaterial({ color: 0xffffff })
		mat.name = 'material:Playfield'
		;(mat.userData as any).pendingMap = 'some_large_backdrop'
		mat.roughness = 0.5
		const geom = new THREE.PlaneGeometry(200, 200)
		const mesh = makeMesh('primitive-playfield_large', geom, mat)
		root.add(mesh)

		root.updateMatrixWorld(true)
		postProcessScene(root, { harnessLog: () => {}, viewerMode: 'viewer' })

		const outMat = mesh.material as THREE.MeshStandardMaterial
		expect(outMat.transparent, 'large non-insert must not be hidden via generic pending').to.equal(false)
		expect(outMat.opacity, 'large non-insert must stay opaque').to.equal(1)
	})
})
