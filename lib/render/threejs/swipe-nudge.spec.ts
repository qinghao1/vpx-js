// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE
import { describe, expect, it } from 'vitest'
import { swipeNudge } from './swipe-nudge.js'

describe('swipeNudge', () => {
	it('determines nudge direction from swipe deltas', () => {
		const NUDGE = { left: 1, right: 2, forward: 3, back: 4 }
		expect(swipeNudge(-50, 5, NUDGE)).toBe(NUDGE.left)
		expect(swipeNudge(50, 5, NUDGE)).toBe(NUDGE.right)
		expect(swipeNudge(5, -50, NUDGE)).toBe(NUDGE.forward)
		expect(swipeNudge(5, 50, NUDGE)).toBe(NUDGE.back)
		expect(swipeNudge(20, 20, NUDGE)).toBeNull()
	})
})
