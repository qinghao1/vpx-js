// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { describe, expect, it } from 'vitest'
import { collectCatchUp } from './catch-up.js'

const item = (state: Record<string, unknown>, data: Record<string, unknown>) => ({
	getState: () => state,
	data,
})

describe('collectCatchUp', () => {
	it('emits live fields that differ from authored data', () => {
		const table = {
			flashers: {
				F1: item(
					{ color: 0xff0000, alpha: 250, isVisible: true },
					{ color: 0xffffff, alpha: 100, isVisible: true },
				),
			},
			primitives: {},
		}
		expect(collectCatchUp(table, {})).toEqual({ F1: { color: 0xff0000, alpha: 250 } })
	})

	it('skips converged, overridden, and data-less fields', () => {
		const table = {
			flashers: {
				same: item({ color: 1, alpha: 100 }, { color: 1, alpha: 100 }),
				held: item({ color: 2, alpha: 200 }, { color: 1, alpha: 100 }),
				nodata: item({ color: 2 }, {}),
				nostate: { data: { color: 1 } },
			},
			primitives: {
				P1: item({ color: 5, alpha: 5, isVisible: false }, { color: 5, alpha: 5, isVisible: true }),
			},
		}
		expect(collectCatchUp(table, { held: {} })).toEqual({ P1: { isVisible: false } })
	})

	it('ignores non-numeric live values and off-allowlist fields', () => {
		const table = {
			flashers: {},
			primitives: {
				P1: item({ color: 'red', alpha: 9, lockedByLS: true }, { color: 1, alpha: 1 }),
			},
		}
		expect(collectCatchUp(table, {})).toEqual({ P1: { alpha: 9 } })
	})
})
