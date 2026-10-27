// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { describe, expect, it } from 'vitest'
import { getEffectiveCaps } from './quality.js'

describe('getEffectiveCaps', () => {
	it('returns a copy: mutating the result does not leak globally', () => {
		const caps = getEffectiveCaps()
		const before = caps.aniso
		;(caps as { aniso: number }).aniso = before + 1000
		expect(getEffectiveCaps().aniso).toBe(before)
		expect(getEffectiveCaps()).not.toBe(caps)
	})
})
