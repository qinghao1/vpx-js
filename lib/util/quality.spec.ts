// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { describe, expect, it } from 'vitest'
import { _resetQualityCache, adaptPixelRatio, getEffectiveCaps, isQualityPinned } from './quality.js'

describe('getEffectiveCaps', () => {
	it('returns a copy: mutating the result does not leak globally', () => {
		const caps = getEffectiveCaps()
		const before = caps.aniso
		;(caps as { aniso: number }).aniso = before + 1000
		expect(getEffectiveCaps().aniso).toBe(before)
		expect(getEffectiveCaps()).not.toBe(caps)
	})
})

function withSearch(search: string | undefined, fn: () => void) {
	const prevLocation = (globalThis as any).location
	try {
		if (search === undefined) delete (globalThis as any).location
		else (globalThis as any).location = { search }
		_resetQualityCache()
		fn()
	} finally {
		if (prevLocation === undefined) delete (globalThis as any).location
		else (globalThis as any).location = prevLocation
		_resetQualityCache()
	}
}

describe('isQualityPinned', () => {
	it('is unpinned with no location and no params', () => {
		withSearch(undefined, () => expect(isQualityPinned()).toBe(false))
		withSearch('', () => expect(isQualityPinned()).toBe(false))
		withSearch('?vpx=table.vpx', () => expect(isQualityPinned()).toBe(false))
	})

	it('is pinned by any explicit quality param', () => {
		for (const search of ['?quality=high', '?quality=low', '?high', '?low', '?mobile']) {
			withSearch(search, () => expect(isQualityPinned()).toBe(true))
		}
	})
})

describe('adaptPixelRatio', () => {
	it('climbs on sustained headroom and stops at the ceiling', () => {
		expect(adaptPixelRatio(0.65, 60, 0.65, 1.5)).toBe(0.81)
		expect(adaptPixelRatio(1.4, 60, 0.65, 1.5)).toBe(1.5)
		expect(adaptPixelRatio(1.5, 60, 0.65, 1.5)).toBe(1.5)
	})

	it('drops when below target and stops at the floor', () => {
		expect(adaptPixelRatio(1.5, 30, 0.65, 1.5)).toBe(1.2)
		expect(adaptPixelRatio(0.7, 30, 0.65, 1.5)).toBe(0.65)
		expect(adaptPixelRatio(0.65, 30, 0.65, 1.5)).toBe(0.65)
	})

	it('holds inside the deadband', () => {
		expect(adaptPixelRatio(1.0, 45, 0.65, 1.5)).toBe(1.0)
		expect(adaptPixelRatio(1.0, 50, 0.65, 1.5)).toBe(1.0)
		expect(adaptPixelRatio(1.0, 54, 0.65, 1.5)).toBe(1.0)
	})

	it('snaps back when bounds move under a live ratio', () => {
		expect(adaptPixelRatio(1.5, 60, 0.65, 1.0)).toBe(1.0)
		expect(adaptPixelRatio(0.5, 30, 0.65, 1.5)).toBe(0.65)
	})

	it('holds the ceiling when the floor exceeds it', () => {
		expect(adaptPixelRatio(0.9, 60, 0.9, 0.5)).toBe(0.5)
		expect(adaptPixelRatio(0.5, 30, 0.9, 0.5)).toBe(0.5)
	})
})
