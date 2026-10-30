// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE

import { describe, expect, it } from 'vitest'
import { buildNodeCache, nudgeOffset } from './shared-scene.js'

describe('nudgeOffset', () => {
	it('returns zero shift for zero input', () => {
		const off = nudgeOffset(0, 0, 0, 0)
		expect(off.x).toBeCloseTo(0, 12)
		expect(off.y).toBeCloseTo(0, 12)
	})

	it('clamps each axis to the shift limit', () => {
		expect(nudgeOffset(1, 0, 0, 0).x).toBe(6)
		expect(nudgeOffset(-1, 0, 0, 0).x).toBe(-6)
		expect(nudgeOffset(0, 1, 0, 0).y).toBe(-6)
	})

	it('scales the y axis by the negative tip factor', () => {
		const off = nudgeOffset(0, 0.01, 0, 0)
		expect(off.x).toBe(0)
		expect(off.y).toBeCloseTo(-0.66, 10)
		const acc = nudgeOffset(0, 0, 0, 10)
		expect(acc.x).toBe(0)
		expect(acc.y).toBeCloseTo(-1.32, 10)
	})

	it('adds the acceleration term to the offset term', () => {
		expect(nudgeOffset(0, 0, 10, 0).x).toBeCloseTo(2.2, 10)
	})
})

function fakeItem(name: string) {
	return {
		getName: () => name,
		getState: () => ({}),
		getUpdater: () => ({
			applyState: () => {},
		}),
	}
}

describe('buildNodeCache', () => {
	it('caches entries, light names, and the lightmap, including the table name', () => {
		const items = [fakeItem('FlipperLeft'), fakeItem('Light1')]
		const table = {
			getItems: () => items,
			getName: () => 'Table1',
			lights: { Light1: {} },
			primitives: { Prim1: { data: { szLightmap: 'Light1' } } },
		}
		const nodes = new Map([
			['FlipperLeft', { id: 'flipper' }],
			['Light1', { id: 'light' }],
		])
		const root = { getObjectByName: (name: string) => nodes.get(name) }
		const cache = buildNodeCache(table, root)
		expect(cache.names).toContain('Table1')
		expect(cache.names).toContain('FlipperLeft')
		const id = cache.idOf('FlipperLeft')
		expect(id).toBeGreaterThanOrEqual(0)
		expect(cache.entries[id]?.name).toBe('FlipperLeft')
		expect(cache.entries[id]?.item).toBe(items[0])
		expect(cache.lightNames.has('Light1')).toBe(true)
		expect(cache.lightmap.get('Light1')).toEqual(['Prim1'])
	})

	it('resolves nodes case-insensitively and skips vrcab flipper rig nodes', () => {
		const items = [fakeItem('FlipperLeft'), fakeItem('VRcabFlipper')]
		const table = { getItems: () => items }
		const root = {
			getObjectByName: (name: string) => (name === 'flipperleft' ? { id: 'flipper' } : undefined),
		}
		const cache = buildNodeCache(table, root)
		const flipperId = cache.idOf('FlipperLeft')
		expect(flipperId).toBeGreaterThanOrEqual(0)
		expect(cache.entries[flipperId]?.node).toEqual({ id: 'flipper' })
		const rigId = cache.idOf('VRcabFlipper')
		expect(rigId).toBeGreaterThanOrEqual(0)
		expect(cache.entries[rigId]).toBeNull()
	})
})
