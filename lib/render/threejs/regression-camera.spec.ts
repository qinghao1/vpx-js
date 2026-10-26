// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { AnimationGate } from '../../util/animation-gate.js'
import { computePlayFraming, computeViewerFraming } from './three-camera-framing.js'

function makeMesh(name: string, geom: THREE.BufferGeometry, pos: THREE.Vector3): THREE.Mesh {
	const m = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color: 0xffffff }) as any)
	m.name = name
	m.position.copy(pos)
	return m
}

function buildGroup(): THREE.Group {
	const root = new THREE.Group()
	root.name = 'table'
	const pc = new THREE.Vector3(0.04, -5.91, 18.99)
	const cabSize = new THREE.Vector3(152.8, 128.5, 210.6)
	const pfSize = new THREE.Vector3(53.1, 38.37, 113)
	root.add(makeMesh('playfield_base', new THREE.BoxGeometry(pfSize.x, pfSize.y, pfSize.z), pc))
	root.add(makeMesh('VRCab_Cabinet', new THREE.BoxGeometry(cabSize.x, cabSize.y, cabSize.z), pc.clone()))
	const legGeom = new THREE.BoxGeometry(8, 8, 40)
	root.add(makeMesh('primitive-leg_left', legGeom, new THREE.Vector3(-25, -20, -30)))
	root.add(makeMesh('primitive-leg_right', legGeom, new THREE.Vector3(25, -20, -30)))
	const vrGeom = new THREE.PlaneGeometry(120, 120)
	const vr = makeMesh('VR_room_wall', vrGeom, new THREE.Vector3(0, 80, 60))
	vr.rotation.x = Math.PI / 2
	root.add(vr)
	root.updateMatrixWorld(true)
	return root
}

describe('regression: camera smooth transition (viewer <-> play)', () => {
	it('framing must keep DMD and playfield visible at both ends (no snap)', () => {
		const group = buildGroup()
		const play = computePlayFraming(group)
		const viewer = computeViewerFraming(group)
		// both framings should have similar maxDim (cabinet) and not jump
		expect(Math.abs(play.maxDim - viewer.maxDim), 'maxDim should not teleport').toBeLessThan(5)
		expect(play.target.distanceTo(viewer.target), 'target should not teleport').toBeLessThan(20)
	})

	it('AnimationGate must properly block and release (no leak on cancel)', async () => {
		const gate = new AnimationGate()
		expect(gate.isAnimating()).toBe(false)
		gate.beginAnimation()
		expect(gate.isAnimating()).toBe(true)
		let waited = false
		const p = gate.waitIfAnimating().then(() => (waited = true))
		await new Promise(r => setTimeout(r, 20))
		expect(waited).toBe(false)
		gate.endAnimation()
		expect(gate.isAnimating()).toBe(false)
		await p
		expect(waited).toBe(true)
		// begin again, then begin again without end should resolve previous
		gate.beginAnimation()
		const p2 = gate.waitIfAnimating()
		gate.beginAnimation() // should resolve previous
		await expect(p2).resolves.toBeUndefined()
		gate.endAnimation()
	})
})
