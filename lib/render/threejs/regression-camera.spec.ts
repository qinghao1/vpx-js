// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import * as fs from 'node:fs'
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
	it('viewer.ts must not have settle delay that causes teleport (ANIM_SETTLE_MS await)', () => {
		const src = fs.readFileSync('demo-browser/src/viewer.ts', 'utf-8')
		expect(src, 'must not await ANIM_SETTLE_MS (caused 80ms freeze then jump)').not.toMatch(
			/await new Promise[\s\S]*ANIM_SETTLE_MS/,
		)
		expect(src, 'must not import ANIM_SETTLE_MS for camera').not.toMatch(/ANIM_SETTLE_MS/)
	})

	it('viewer.ts must clean up gate on cancel and restore controls', () => {
		const src = fs.readFileSync('demo-browser/src/viewer.ts', 'utf-8')
		// gate must be ended even when gen mismatches (cancelled mid-flight)
		expect(src, 'must end gate on gen mismatch').toMatch(/_gen !== this\._cameraGen[\s\S]*gate\.endAnimation/)
		expect(src, 'must restore controls.enabled on cancel').toMatch(
			/_gen !== this\._cameraGen[\s\S]*controls\.enabled/,
		)
	})

	it('animation lerp must be smooth — no teleport in middle', () => {
		const group = buildGroup()
		const play = computePlayFraming(group)
		const viewer = computeViewerFraming(group)
		const fromPos = viewer.position.clone()
		const toPos = play.position.clone()
		const fromTarget = viewer.target.clone()
		const toTarget = play.target.clone()
		const total = fromPos.distanceTo(toPos)
		expect(total, 'play/viewer distance should be reasonable (~40)').toBeGreaterThan(10)
		expect(total).toBeLessThan(200)

		const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
		const duration = 900
		const samples: THREE.Vector3[] = []
		for (let ms = 0; ms <= duration; ms += 16) {
			const t = Math.min(1, ms / duration)
			const e = ease(t)
			const pos = new THREE.Vector3().lerpVectors(fromPos, toPos, e)
			samples.push(pos)
		}
		let maxJump = 0
		for (let i = 1; i < samples.length; i++) maxJump = Math.max(maxJump, samples[i]!.distanceTo(samples[i - 1]!))
		const avg = total / samples.length
		// smooth cubic should have max jump ~3x avg, not >6x (teleport)
		expect(
			maxJump,
			`max single-frame jump ${maxJump.toFixed(2)} vs avg ${avg.toFixed(2)} — teleport if >6x`,
		).toBeLessThan(avg * 6)
		// first frames should start moving soon — not stuck 80ms (the bug had 0 movement for 5 frames)
		const after80 = samples[5]!.distanceTo(samples[0]!)
		expect(after80, 'after 80ms should have moved >0.05 (not stuck by settle delay)').toBeGreaterThan(0.05)
		const firstMove = samples[1]!.distanceTo(samples[0]!)
		expect(firstMove, 'first 16ms should move >0 (not completely frozen)').toBeGreaterThan(0.0001)
		// check target also smooth
		const targetSamples: THREE.Vector3[] = []
		for (let ms = 0; ms <= duration; ms += 16) {
			const t = Math.min(1, ms / duration)
			const e = ease(t)
			targetSamples.push(new THREE.Vector3().lerpVectors(fromTarget, toTarget, e))
		}
		let maxTgtJump = 0
		for (let i = 1; i < targetSamples.length; i++)
			maxTgtJump = Math.max(maxTgtJump, targetSamples[i]!.distanceTo(targetSamples[i - 1]!))
		expect(maxTgtJump).toBeLessThan((fromTarget.distanceTo(toTarget) / targetSamples.length) * 6)
	})

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
