// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { describe, expect, it } from 'vitest'
import { AnimationGate } from './animation-gate.js'

describe('AnimationGate', () => {
	it('must properly block and release (no leak on cancel)', async () => {
		const gate = new AnimationGate()
		expect(gate.isAnimating()).toBe(false)
		gate.beginAnimation()
		expect(gate.isAnimating()).toBe(true)
		let waited = false
		const p = gate.waitIfAnimating().then(() => (waited = true))
		await new Promise(r => setTimeout(r, 20))
		expect(waited).toBe(false)
		gate.endAnimation()
		expect(gate.isAnimating()).toBe(false)
		await p
		expect(waited).toBe(true)
		// begin again, then begin again without end should resolve previous
		gate.beginAnimation()
		const p2 = gate.waitIfAnimating()
		gate.beginAnimation() // should resolve previous
		await expect(p2).resolves.toBeUndefined()
		gate.endAnimation()
	})
})
