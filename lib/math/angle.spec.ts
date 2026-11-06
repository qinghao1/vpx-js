// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { describe, expect, it } from 'vitest'
import { degToRad } from './angle.js'

describe('degToRad', () => {
	it('matches the standard degree table', () => {
		expect(degToRad(0)).toBe(0)
		expect(degToRad(30)).toBeCloseTo(Math.PI / 6, 15)
		expect(degToRad(45)).toBeCloseTo(Math.PI / 4, 15)
		expect(degToRad(60)).toBeCloseTo(Math.PI / 3, 15)
		expect(degToRad(180)).toBeCloseTo(Math.PI, 15)
		expect(degToRad(360)).toBeCloseTo(2 * Math.PI, 15)
	})
})
