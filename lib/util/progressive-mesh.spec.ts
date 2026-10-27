// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { describe, expect, it } from 'vitest'
import { removeFillWithBack } from './progressive-mesh.js'

describe('removeFillWithBack', () => {
	it('swap-removes a middle item in O(1)', () => {
		const arr = ['a', 'b', 'c']
		removeFillWithBack(arr, 'b')
		expect(arr).toEqual(['a', 'c'])
	})

	it('removes the last item without touching the rest', () => {
		const arr = ['a', 'b']
		removeFillWithBack(arr, 'b')
		expect(arr).toEqual(['a'])
	})

	it('throws on absent items instead of corrupting the array', () => {
		const arr = ['a', 'b', 'c']
		expect(() => removeFillWithBack(arr, 'zzz-missing')).toThrow('removeFillWithBack: item not in array')
		// The failed remove must leave the array untouched: no pop, no stray key.
		expect(arr).toEqual(['a', 'b', 'c'])
		expect((arr as unknown as Record<string, unknown>)['-1']).toBeUndefined()
	})
})
