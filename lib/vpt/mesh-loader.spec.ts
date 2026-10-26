// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { describe, expect, it } from 'vitest'
import { loadMesh } from './mesh-loader.js'

describe('loadMesh', () => {
	it('loads a registry mesh with vertices and indices', () => {
		const mesh = loadMesh('ball-mesh')
		expect(mesh.vertices.length).toBeGreaterThan(0)
		expect(mesh.indices.length).toBeGreaterThan(0)
	})

	it('returns the cached instance on repeat loads', () => {
		expect(loadMesh('ball-mesh')).toBe(loadMesh('ball-mesh'))
	})

	it('throws for unknown mesh names', () => {
		expect(() => loadMesh('no-such-mesh')).toThrow(/not found/)
	})

	it('shares the cached instance, so callers must clone before mutating', () => {
		const mesh = loadMesh('trigger-star-mesh')
		const originalName = mesh.name
		mesh.name = 'mutated-by-test'
		try {
			expect(loadMesh('trigger-star-mesh').name).toBe('mutated-by-test')
		} finally {
			mesh.name = originalName
		}
	})
})
