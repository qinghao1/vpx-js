// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import * as THREE from 'three'
import { computePlayFraming, computeViewerFraming } from '../../../demo-browser/src/scene.js'

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

const DMD = new THREE.Vector3(-0.27, 31.75, -54.22)
const DMD_TOP = DMD.clone().add(new THREE.Vector3(0, 2, -6))
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
	const aspects = [0.6, 0.75, 1.0, 1.33, 1.78, 2.0, 2.5]

	it('play framing shows DMD with margin and full playfield at all aspects (FOV 40)', () => {
		const group = buildWalkingDeadGroup()
		const state = computePlayFraming(group)

		expect(state.maxDim, 'play maxDim should be cabinet size ~210').to.be.closeTo(210.6, 6)
		expect(state.target.z, 'play forwardBias -0.07').to.be.closeTo(18.99 + 210.6 * -0.07, 0.5)

		for (const asp of aspects) {
			const dc = ndc(DMD, state.position, state.target, 40, asp)
			const dt = ndc(DMD_TOP, state.position, state.target, 40, asp)
			let minY = Infinity
			let maxY = -Infinity
			let minX = Infinity
			let maxX = -Infinity
			for (const p of PF_CORNERS) {
				const n = ndc(p, state.position, state.target, 40, asp)
				minY = Math.min(minY, n.y)
				maxY = Math.max(maxY, n.y)
				minX = Math.min(minX, n.x)
				maxX = Math.max(maxX, n.x)
			}
			expect(dc.y, `play asp ${asp} DMD center Y`).to.be.within(0.64, 0.76)
			expect(dt.y, `play asp ${asp} DMD top Y must stay below 0.82 with margin`).to.be.lessThan(0.82)
			expect(dt.y, `play asp ${asp} DMD top above center`).to.be.greaterThan(dc.y)
			expect(minY, `play asp ${asp} playfield bottom`).to.be.within(-0.92, -0.65)
			expect(maxY, `play asp ${asp} playfield top`).to.be.within(0.3, 0.62)
			expect(minX, `play asp ${asp} playfield left`).to.be.greaterThan(-0.95)
			expect(maxX, `play asp ${asp} playfield right`).to.be.lessThan(0.95)
			// ensure no clipping beyond NDC
			expect(minY, `play asp ${asp} not clipped bottom`).to.be.greaterThan(-1)
			expect(maxY, `play asp ${asp} not clipped top`).to.be.lessThan(1)
		}
	})

	it('play is tighter than viewer (cropping legs via frustum) but both fit', () => {
		const group = buildWalkingDeadGroup()
		const play = computePlayFraming(group)
		const viewer = computeViewerFraming(group)
		expect(play.maxDim, 'play and viewer share cabinet maxDim').to.be.closeTo(viewer.maxDim, 1)
		expect(play.target.z, 'play forwardBias shifts target forward').to.be.lessThan(viewer.target.z)
		expect(play.position.y, 'play camera more overhead').to.be.greaterThan(viewer.position.y)
		expect(play.position.z, 'play camera more forward (bias)').to.be.lessThan(viewer.position.z)
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
