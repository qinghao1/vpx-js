// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import * as THREE from 'three'
import { isAuthorDebugName } from './scene-classify.js'
import { applyAuthorDebugPass } from './visibility-heuristics.js'

function makeMesh(name: string, visible = true): THREE.Mesh {
	const mesh = new THREE.Mesh(new THREE.BufferGeometry())
	mesh.name = name
	mesh.visible = visible
	return mesh
}

describe('author-debug leftover hiding', () => {
	it('matches debug tokens at name boundaries only', () => {
		expect(isAuthorDebugName('debug_BLW3')).toBe(true)
		expect(isAuthorDebugName('debugKicker')).toBe(true)
		expect(isAuthorDebugName('surface.top-debug_BLW3')).toBe(true)
		expect(isAuthorDebugName('primitive.debugKickAim')).toBe(true)
		expect(isAuthorDebugName('surface.top-Wall48')).toBe(false)
		expect(isAuthorDebugName('playfield_base')).toBe(false)
		expect(isAuthorDebugName('flipper.base-LeftFlipper')).toBe(false)
		expect(isAuthorDebugName('topdebug')).toBe(false)
		expect(isAuthorDebugName('')).toBe(false)
		expect(isAuthorDebugName(undefined)).toBe(false)
	})

	it('hides only the debug subtree and counts it', () => {
		const root = new THREE.Group()
		const group = new THREE.Group()
		group.name = 'debug_BLW3'
		const stray = makeMesh('surface.top-debug_BLW3')
		const kept = makeMesh('surface.top-Wall48')
		const alreadyHidden = makeMesh('surface.top-debug_BLW1', false)
		group.add(stray)
		root.add(group, kept, alreadyHidden)
		const stats: Record<string, number> = {}
		expect(applyAuthorDebugPass([group, stray, kept, alreadyHidden] as THREE.Object3D[], stats)).toBe(1)
		expect(stray.visible).toBe(false)
		expect(kept.visible).toBe(true)
		expect(alreadyHidden.visible).toBe(false)
	})
})
