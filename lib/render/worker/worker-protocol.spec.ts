// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { describe, expect, it } from 'vitest'
import { resolveBootFov } from './worker-protocol.js'

describe('resolveBootFov', () => {
	it('passes table FOV through (TWD desktop 40 stays 40, not 45)', () => {
		expect(resolveBootFov(40)).toBe(40)
	})
	it('falls back to 45 when unset or non-finite', () => {
		expect(resolveBootFov(undefined)).toBe(45)
		expect(resolveBootFov(Number.NaN)).toBe(45)
	})
	it('clamps to the main-thread 20-70 range', () => {
		expect(resolveBootFov(10)).toBe(20)
		expect(resolveBootFov(90)).toBe(70)
	})
})
