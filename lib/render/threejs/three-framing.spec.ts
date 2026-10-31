// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import * as THREE from 'three'
import { applyCameraState, computePlayFraming, computeViewerFraming } from './three-camera-framing.js'

chai.use((sinonChai as any).default ?? sinonChai)

function makeMesh(name: string, geometry: THREE.BufferGeometry, position: THREE.Vector3): THREE.Mesh {
	const mat = new THREE.MeshStandardMaterial({ color: 0xffffff })
	const mesh = new THREE.Mesh(geometry, mat as any)
	mesh.name = name
	mesh.position.copy(position)
	return mesh
}

function buildWalkingDeadGroup(): THREE.Group {
	const root = new THREE.Group()
	root.name = 'table'

	const pc = new THREE.Vector3(0.04, -5.91, 18.99)
	const cabSize = new THREE.Vector3(152.8, 128.5, 210.6)
	const pfSize = new THREE.Vector3(53.1, 38.37, 113)

	// Playfield defines target center pc
	const pfGeom = new THREE.BoxGeometry(pfSize.x, pfSize.y, pfSize.z)
	const playfield = makeMesh('playfield_base', pfGeom, pc)
	root.add(playfield)

	// Apron/button keep target same but not needed
	const apronGeom = new THREE.BoxGeometry(10, 5, 2)
	const apron = makeMesh('primitive-apron', apronGeom, pc.clone().add(new THREE.Vector3(0, -10, 5)))
	root.add(apron)

	// Cabinet defines size maxDim ~210.6 centered at pc (encloses playfield + DMD)
	const cabGeom = new THREE.BoxGeometry(cabSize.x, cabSize.y, cabSize.z)
	const cabinet = makeMesh('VRCab_Cabinet', cabGeom, pc.clone())
	root.add(cabinet)

	// Legs that must be excluded for PLAY sizing but included for VIEWER
	const legGeom = new THREE.BoxGeometry(8, 8, 40)
	const legL = makeMesh('primitive-leg_left', legGeom, new THREE.Vector3(-25, -20, -30))
	const legR = makeMesh('primitive-leg_right', legGeom, new THREE.Vector3(25, -20, -30))
	root.add(legL)
	root.add(legR)

	// VR non-cab that should be excluded from both sizings
	const vrGeom = new THREE.PlaneGeometry(120, 120)
	const vr = makeMesh('VR_room_wall', vrGeom, new THREE.Vector3(0, 80, 60))
	vr.rotation.x = Math.PI / 2
	root.add(vr)

	root.updateMatrixWorld(true)
	return root
}

// Same playfield as buildWalkingDeadGroup but a much taller backbox, longer
// legs, a cabinet-front overhang and keep-token furniture (plunger, apron,
// button): per-table cabinet proportions and furniture must not move the play
// camera.
function buildBigCabinetGroup(): THREE.Group {
	const root = buildWalkingDeadGroup()
	root.add(makeMesh('VRCab_BackboxTall', new THREE.BoxGeometry(60, 220, 40), new THREE.Vector3(0, 90, -70)))
	root.add(makeMesh('VRCab_LegTall', new THREE.BoxGeometry(8, 200, 8), new THREE.Vector3(25, -110, -30)))
	root.add(
		makeMesh('primitive-VRCab_FrontMolding', new THREE.BoxGeometry(30, 20, 60), new THREE.Vector3(0, -30, 100)),
	)
	root.add(makeMesh('primitive-plunger_housing', new THREE.BoxGeometry(30, 30, 60), new THREE.Vector3(20, -30, 100)))
	root.add(makeMesh('primitive-apron_trim', new THREE.BoxGeometry(70, 10, 10), new THREE.Vector3(0, -20, 60)))
	root.add(makeMesh('primitive-start_button', new THREE.BoxGeometry(6, 6, 6), new THREE.Vector3(-15, -25, 90)))
	root.updateMatrixWorld(true)
	return root
}

const DMD = new THREE.Vector3(-0.27, 31.75, -54.22)
const PF_MIN = new THREE.Vector3(-26.5, -25.07, -37.5)
const PF_MAX = new THREE.Vector3(26.6, 13.3, 75.5)
const PF_CORNERS: THREE.Vector3[] = []
for (const x of [PF_MIN.x, PF_MAX.x])
	for (const y of [PF_MIN.y, PF_MAX.y])
		for (const z of [PF_MIN.z, PF_MAX.z]) PF_CORNERS.push(new THREE.Vector3(x, y, z))

function ndc(
	pos: THREE.Vector3,
	camPos: THREE.Vector3,
	target: THREE.Vector3,
	fov: number,
	aspect: number,
): THREE.Vector3 {
	const cam = new THREE.PerspectiveCamera(fov, aspect, 0.1, 4000)
	cam.position.copy(camPos)
	cam.lookAt(target)
	cam.updateMatrixWorld()
	cam.updateProjectionMatrix()
	return pos.clone().project(cam)
}

describe('regression: framing keeps DMD and full playfield visible', () => {
	const aspects = [0.5, 0.6, 0.75, 1.0, 1.33, 1.78, 2.0, 2.5]

	it('play framing fits the playfield surface at all aspects (FOV 45)', () => {
		const group = buildWalkingDeadGroup()
		for (const asp of aspects) {
			const state = computePlayFraming(group, { fov: 45, aspect: asp })
			let extreme = 0
			for (const p of PF_CORNERS) {
				const n = ndc(p, state.position, state.target, 45, asp)
				extreme = Math.max(extreme, Math.abs(n.x), Math.abs(n.y))
			}
			expect(extreme, `play asp ${asp} surface fits the frame`).to.be.lessThan(1)
			expect(extreme, `play asp ${asp} surface fills the frame`).to.be.greaterThan(0.95)
		}
	})

	it('cabinet proportions do not move the play camera', () => {
		// A taller backbox, longer legs and a cabinet-front overhang change
		// the cabinet-driven size box but must not change the fitted play
		// view: distance comes from the playfield surface only.
		const plain = computePlayFraming(buildWalkingDeadGroup(), { fov: 45, aspect: 16 / 9 })
		const cabined = computePlayFraming(buildBigCabinetGroup(), { fov: 45, aspect: 16 / 9 })
		expect(cabined.position.distanceTo(plain.position), 'cabinet must not move the play camera').to.be.closeTo(
			0,
			1e-6,
		)
		expect(cabined.target.distanceTo(plain.target), 'cabinet must not move the play target').to.be.closeTo(0, 1e-6)
		// The orbit overview still frames the whole machine, legs included.
		const viewerPlain = computeViewerFraming(buildWalkingDeadGroup())
		const viewerCabined = computeViewerFraming(buildBigCabinetGroup())
		expect(viewerCabined.maxDim, 'viewer keeps sizing the whole machine').to.be.greaterThan(viewerPlain.maxDim)
	})

	it('degenerate optics fall back to a finite distance', () => {
		const group = buildWalkingDeadGroup()
		for (const view of [
			{ fov: 0, aspect: 16 / 9 },
			{ fov: 45, aspect: 0 },
			{ fov: 45, aspect: -1 },
		]) {
			const state = computePlayFraming(group, view)
			const dist = state.position.distanceTo(state.target)
			expect(dist, `fallback dist for ${JSON.stringify(view)}`).to.be.finite
			expect(dist, `fallback dist for ${JSON.stringify(view)}`).to.be.greaterThan(0)
		}
	})

	it('hyphenated cabinet names size the viewer but not the play camera', () => {
		const group = buildWalkingDeadGroup()
		group.add(
			makeMesh('primitive-VR-Cab_CabinetTall', new THREE.BoxGeometry(60, 220, 40), new THREE.Vector3(0, 90, -70)),
		)
		group.updateMatrixWorld(true)
		expect(computeViewerFraming(group).maxDim, 'hyphenated cab still sizes the viewer').to.be.greaterThan(210.6)
		const play = computePlayFraming(group, { fov: 45, aspect: 16 / 9 })
		const plain = computePlayFraming(buildWalkingDeadGroup(), { fov: 45, aspect: 16 / 9 })
		expect(play.position.distanceTo(plain.position), 'hyphenated cab must not move the play camera').to.be.closeTo(
			0,
			1e-6,
		)
	})

	it('a table with no playfield-named mesh still frames finitely', () => {
		const root = new THREE.Group()
		root.add(makeMesh('VRCab_Cabinet', new THREE.BoxGeometry(60, 120, 210), new THREE.Vector3(0, 20, 0)))
		root.add(makeMesh('primitive-coin_door', new THREE.BoxGeometry(20, 20, 4), new THREE.Vector3(0, -30, 100)))
		root.updateMatrixWorld(true)
		const state = computePlayFraming(root, { fov: 45, aspect: 16 / 9 })
		const dist = state.position.distanceTo(state.target)
		expect(dist, 'fallback distance is finite').to.be.finite
		expect(dist, 'fallback distance is positive').to.be.greaterThan(0)
	})

	it('play is tighter than viewer but both fit', () => {
		const group = buildWalkingDeadGroup()
		const play = computePlayFraming(group, { fov: 45, aspect: 16 / 9 })
		const viewer = computeViewerFraming(group)
		expect(play.maxDim, 'play and viewer share cabinet maxDim').to.be.closeTo(viewer.maxDim, 1e-6)
		expect(
			play.position.distanceTo(play.target),
			'play fits the surface so sits closer than the cabinet-wide orbit',
		).to.be.lessThan(viewer.position.distanceTo(viewer.target))
		expect(play.target.z, 'play forwardBias shifts target forward').to.be.lessThan(viewer.target.z)
	})

	it('unseparated VR names are excluded from sizing', () => {
		const withRoom = buildWalkingDeadGroup()
		const roomGeom = new THREE.BoxGeometry(2000, 2000, 2000)
		const room = makeMesh('primitive-VRMega1', roomGeom, new THREE.Vector3(0, 800, 600))
		withRoom.add(room)
		withRoom.updateMatrixWorld(true)
		const framed = computeViewerFraming(withRoom)
		expect(framed.maxDim, 'VRMega room must not inflate framing').to.be.closeTo(210.6, 6)
	})

	it('non-table scenery is excluded from sizing whatever it is named', () => {
		// Token-free names: exclusion holds by construction, not by token.
		const withSky = buildWalkingDeadGroup()
		withSky.add(makeMesh('primitive-MegaDome', new THREE.BoxGeometry(6000, 6000, 6000), new THREE.Vector3(0, 0, 0)))
		withSky.add(makeMesh('primitive-Orb1', new THREE.BoxGeometry(2000, 2000, 2000), new THREE.Vector3(0, 500, 0)))
		withSky.updateMatrixWorld(true)
		expect(computeViewerFraming(withSky).maxDim, 'scenery must not inflate viewer').to.be.closeTo(210.6, 6)
		expect(
			computePlayFraming(withSky, { fov: 45, aspect: 16 / 9 }).maxDim,
			'scenery must not inflate play',
		).to.be.closeTo(210.6, 6)
	})

	it('applied camera state keeps the orbit inside the framed world', () => {
		const group = buildWalkingDeadGroup()
		const state = computeViewerFraming(group)
		const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 4000)
		const controls = { target: new THREE.Vector3(), update: () => {} }
		applyCameraState(camera, controls, state)
		const dist = state.position.distanceTo(state.target)
		expect(controls.maxDistance, 'dolly-out must stay near the table').to.be.closeTo(dist * 3, 1)
		expect(controls.minDistance, 'dolly-in must stay out of the table').to.be.greaterThan(0)
		expect(controls.minDistance, 'dolly-in must allow close-ups').to.be.lessThan(dist)
	})

	it('viewer <-> play transition does not teleport the target (no snap)', () => {
		const group = buildWalkingDeadGroup()
		const play = computePlayFraming(group, { fov: 45, aspect: 16 / 9 })
		const viewer = computeViewerFraming(group)
		expect(play.target.distanceTo(viewer.target), 'target should not teleport').to.be.lessThan(20)
	})

	it('viewer framing keeps playfield and DMD inside NDC at all aspects (FOV 45)', () => {
		const group = buildWalkingDeadGroup()
		const state = computeViewerFraming(group)
		for (const asp of aspects) {
			const dc = ndc(DMD, state.position, state.target, 45, asp)
			let minY = Infinity
			let maxY = -Infinity
			let minX = Infinity
			let maxX = -Infinity
			for (const p of PF_CORNERS) {
				const n = ndc(p, state.position, state.target, 45, asp)
				minY = Math.min(minY, n.y)
				maxY = Math.max(maxY, n.y)
				minX = Math.min(minX, n.x)
				maxX = Math.max(maxX, n.x)
			}
			expect(dc.y, `viewer asp ${asp} DMD Y`).to.be.within(0.35, 0.85)
			expect(minY, `viewer asp ${asp} pf bottom`).to.be.greaterThan(-1)
			expect(maxY, `viewer asp ${asp} pf top`).to.be.lessThan(1)
			expect(minX, `viewer asp ${asp} pf left`).to.be.greaterThan(-1)
			expect(maxX, `viewer asp ${asp} pf right`).to.be.lessThan(1)
		}
	})
})
