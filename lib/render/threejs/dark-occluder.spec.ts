// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import * as THREE from 'three'
import { postProcessScene } from './three-scene-postprocess.js'

chai.use((sinonChai as any).default ?? sinonChai)

function makeMesh(name: string, geometry: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[]): THREE.Mesh {
	const mesh = new THREE.Mesh(geometry, mat as any)
	mesh.name = name
	return mesh
}

describe('regression: dark occluder side artifact', () => {
	// One shared scene: postProcessScene is deterministic and every test
	// below is read-only (visibility/flag asserts), so rebuilding the same
	// 7-mesh scene per test only burns time.
	let sharedScene: ReturnType<typeof buildOccluderScene> | undefined
	function setupOccluderScene(): ReturnType<typeof buildOccluderScene> {
		return (sharedScene ??= buildOccluderScene())
	}
	function buildOccluderScene(): {
		blackbox: THREE.Mesh
		cabinet: THREE.Mesh
		small: THREE.Mesh
		whiteWall: THREE.Mesh
		playfield: THREE.Mesh
		gate: THREE.Mesh
		vrDark: THREE.Mesh
		authored: THREE.Mesh[]
		logText: string
	} {
		const root = new THREE.Group()
		root.name = 'table'

		const blackMat = new THREE.MeshStandardMaterial({ color: 0x020202 })
		blackMat.name = 'Black'
		const blackGeom = new THREE.BoxGeometry(50, 40, 10)
		const blackbox = makeMesh('primitive-blackbox', blackGeom, blackMat)
		blackbox.position.set(0, 0, 0)
		root.add(blackbox)

		const cabMat = new THREE.MeshStandardMaterial({ color: 0xffffff })
		cabMat.name = 'VR_Cabinet'
		const tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
		tex.name = 'VR_CabinetNEW_1'
		tex.needsUpdate = true
		cabMat.map = tex as any
		const cabGeom = new THREE.PlaneGeometry(100, 100)
		const cabinet = makeMesh('VRCab_Cabinet', cabGeom, cabMat)
		cabinet.position.set(0, 0, 0.01)
		root.add(cabinet)

		const smallMat = new THREE.MeshStandardMaterial({ color: 0x020202 })
		smallMat.name = 'DarkSmall'
		const smallGeom = new THREE.BoxGeometry(7, 5, 2)
		const small = makeMesh('LM_small_dark', smallGeom, smallMat)
		small.position.set(10, 10, 5)
		root.add(small)

		const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff })
		whiteMat.name = 'WhiteWall'
		const whiteGeom = new THREE.BoxGeometry(12, 12, 12)
		const whiteWall = makeMesh('wall_stray', whiteGeom, whiteMat)
		whiteWall.position.set(20, 20, 5)
		root.add(whiteWall)

		const authored: THREE.Mesh[] = []
		for (const [meshName, x] of [
			['primitive-RailLeft1', 40],
			['rubber-SlingR', 45],
			['surface.top-SideWall', 50],
		] as Array<[string, number]>) {
			const authoredMat = new THREE.MeshStandardMaterial({ color: 0xffffff })
			authoredMat.name = 'WhiteAuthored'
			const authoredMesh = makeMesh(meshName, new THREE.BoxGeometry(12, 12, 12), authoredMat)
			authoredMesh.position.set(x, 20, 5)
			root.add(authoredMesh)
			authored.push(authoredMesh)
		}

		const pfMat = new THREE.MeshStandardMaterial({ color: 0xffffff })
		pfMat.name = 'PlayfieldMat'
		const pfGeom = new THREE.PlaneGeometry(20, 20)
		const playfield = makeMesh('playfield_base', pfGeom, pfMat)
		playfield.position.set(0, 0, -1)
		root.add(playfield)

		const gateMat = new THREE.MeshStandardMaterial({ color: 0x020202 })
		gateMat.name = 'GateBlack'
		const gateGeom = new THREE.BoxGeometry(50, 40, 10)
		const gate = makeMesh('gate_wire_large', gateGeom, gateMat)
		gate.position.set(-30, -30, 5)
		root.add(gate)

		const vrDarkMat = new THREE.MeshStandardMaterial({ color: 0x020202 })
		vrDarkMat.name = 'VRDark'
		const vrGeom = new THREE.PlaneGeometry(100, 100)
		const vrDark = makeMesh('VR_dark_plane', vrGeom, vrDarkMat)
		vrDark.position.set(0, 0, 2)
		root.add(vrDark)

		const logs: string[] = []
		root.updateMatrixWorld(true)
		postProcessScene(root, { harnessLog: (msg: string) => logs.push(msg), viewerMode: 'viewer' })
		return { blackbox, cabinet, small, whiteWall, playfield, gate, vrDark, authored, logText: logs.join(' ') }
	}

	function singleMaterial(mesh: THREE.Mesh): THREE.MeshStandardMaterial {
		return Array.isArray(mesh.material)
			? (mesh.material[0] as THREE.MeshStandardMaterial)
			: (mesh.material as THREE.MeshStandardMaterial)
	}

	it('hides the large dark untextured occluder (blackbox)', () => {
		const { blackbox } = setupOccluderScene()
		expect(blackbox.visible, 'primitive-blackbox large dark occluder must be hidden').to.equal(false)
	})

	it('keeps small dark meshes visible (size <25 threshold)', () => {
		const { small } = setupOccluderScene()
		expect(small.visible, 'small dark LM should remain visible (size <25 threshold)').to.equal(true)
	})

	it('keeps the textured VR cabinet visible and pushes it forward', () => {
		const { cabinet } = setupOccluderScene()
		expect(cabinet.visible, 'textured VR cabinet must stay visible').to.equal(true)
		const cabMatAfter = singleMaterial(cabinet)
		expect(cabMatAfter.polygonOffset, 'textured VR cabinet should be pushed forward with polygonOffset').to.equal(
			true,
		)
		expect(cabMatAfter.polygonOffsetFactor).to.equal(0)
		expect(cabMatAfter.polygonOffsetUnits).to.equal(-1)
	})

	it('hides the white untextured stray and logs it', () => {
		const { whiteWall, logText } = setupOccluderScene()
		expect(whiteWall.visible, 'white untextured stray must be hidden').to.equal(false)
		expect(logText).to.include('white untextured')
	})

	it('keeps white untextured authored item meshes visible', () => {
		const { authored } = setupOccluderScene()
		expect(authored.map(mesh => mesh.name)).to.deep.equal([
			'primitive-RailLeft1',
			'rubber-SlingR',
			'surface.top-SideWall',
		])
		for (const mesh of authored) {
			expect(mesh.visible, `${mesh.name} is authored geometry, not a stray`).to.equal(true)
		}
	})

	it('keeps the playfield visible despite white', () => {
		const { playfield } = setupOccluderScene()
		expect(playfield.visible, 'playfield must remain visible despite white').to.equal(true)
	})

	it('keeps large dark gate meshes visible (excluded by name)', () => {
		const { gate } = setupOccluderScene()
		expect(gate.visible, 'gate large dark must NOT be hidden (excluded by name)').to.equal(true)
	})

	it('keeps untextured VR dark planes visible without polygon offset', () => {
		const { vrDark } = setupOccluderScene()
		expect(vrDark.visible, 'VR dark without map must remain visible (excluded)').to.equal(true)
		expect(singleMaterial(vrDark).polygonOffset, 'untextured VR should have polygonOffset false').to.equal(false)
	})

	it('does not hide dark mesh with non-black texture', () => {
		const root = new THREE.Group()
		const mat = new THREE.MeshStandardMaterial({ color: 0x020202 })
		mat.name = 'DarkButTextured'
		const tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
		tex.name = 'wood_planks'
		mat.map = tex as any
		const geom = new THREE.BoxGeometry(50, 40, 10)
		const mesh = makeMesh('primitive-test', geom, mat)
		root.add(mesh)
		postProcessScene(root, { harnessLog: () => {} })
		expect(mesh.visible, 'dark with non-black map must not be hidden').to.equal(true)
	})

	it('hides dark mesh with black map even when textured', () => {
		const root = new THREE.Group()
		const mat = new THREE.MeshStandardMaterial({ color: 0x020202 })
		mat.name = 'BlackMap'
		const tex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
		tex.name = 'black_plastic'
		mat.map = tex as any
		const geom = new THREE.BoxGeometry(50, 40, 10)
		const mesh = makeMesh('primitive-test-blackmap', geom, mat)
		root.add(mesh)
		postProcessScene(root, { harnessLog: () => {} })
		expect(mesh.visible, 'dark with black map and large size should be hidden').to.equal(false)
	})

	it('is generic: different large dark names both hidden', () => {
		const root = new THREE.Group()
		for (const name of ['primitive-blackbox', 'primitive-darkwall', 'custom_occluder']) {
			const mat = new THREE.MeshStandardMaterial({ color: 0x010101 })
			mat.name = 'Black'
			const geom = new THREE.BoxGeometry(60, 60, 8)
			const m = makeMesh(name, geom, mat)
			root.add(m)
		}
		postProcessScene(root, { harnessLog: () => {} })
		const hidden = root.children.filter((c: any) => c.isMesh && !c.visible).length
		expect(hidden, 'all large dark untextured generics must be hidden').to.equal(3)
	})

	it('measures rotated meshes through the world matrix, not the local box', () => {
		const root = new THREE.Group()
		const mat = new THREE.MeshStandardMaterial({ color: 0x020202 })
		mat.name = 'Black'
		const mesh = makeMesh('primitive-blackbox-rot', new THREE.BoxGeometry(50, 40, 10), mat)
		mesh.rotation.z = Math.PI / 4
		root.add(mesh)
		postProcessScene(root, { harnessLog: () => {} })
		// Local z extent is 10 (>= 4 threshold) but the world z extent after a
		// 45° roll is what must be measured; either way this occluder hides.
		expect(mesh.visible, 'rotated large dark occluder must be hidden').to.equal(false)
	})
})
