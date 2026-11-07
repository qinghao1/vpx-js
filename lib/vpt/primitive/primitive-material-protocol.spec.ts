// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Color, NormalBlending } from 'three'
import { describe, expect, it } from 'vitest'
import { multiplyHex, NORMAL_BLENDING, syncClassicAlphaFlags } from './primitive-material-protocol.js'

// Deterministic PRNG (mulberry32) so the oracle sweep is stable run to run.
const rand = (() => {
	let s = 0x9e3779b9
	return (): number => {
		s |= 0
		s = (s + 0x6d2b79f5) | 0
		let t = Math.imul(s ^ (s >>> 15), 1 | s)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
})()
const randHex = (): number => Math.floor(rand() * 0x1000000)
const oracle = (base: number, prim: number): number => new Color(base).multiply(new Color(prim)).getHex()

describe('multiplyHex', () => {
	it('matches three.js Color on edge values', () => {
		const edges: Array<[number, number]> = [
			[0x000000, 0x000000],
			[0xffffff, 0xffffff],
			[0xffffff, 0x000000],
			[0xff0000, 0x00ff00],
			[0x123456, 0xabcdef],
			[0x010101, 0xfefefe],
			[0x808080, 0x808080],
		]
		for (const [base, prim] of edges) expect(multiplyHex(base, prim)).toBe(oracle(base, prim))
	})
	it('matches three.js Color on 2000 seeded pairs', () => {
		for (let i = 0; i < 2000; i++) {
			const base = randHex()
			const prim = randHex()
			expect(multiplyHex(base, prim)).toBe(oracle(base, prim))
		}
	})
})

describe('NORMAL_BLENDING', () => {
	it('equals the three.js enum value', () => {
		expect(NORMAL_BLENDING).toBe(NormalBlending)
	})
})

describe('syncClassicAlphaFlags', () => {
	it('keeps an opaque material non-transparent with normal blending', () => {
		const mat = { opacity: 0, transparent: true, depthWrite: false, depthTest: false, blending: 2 }
		syncClassicAlphaFlags(mat, 1)
		expect(mat).toMatchObject({ opacity: 1, transparent: false, depthWrite: true, depthTest: true, blending: 1 })
	})
	it('flips a faded material transparent without depth write', () => {
		const mat = { opacity: 1, transparent: false, depthWrite: true, depthTest: true, blending: 1 }
		syncClassicAlphaFlags(mat, 0.5)
		expect(mat).toMatchObject({ opacity: 0.5, transparent: true, depthWrite: false, depthTest: true, blending: 1 })
	})
	it('leaves additive-blend opt-outs alone', () => {
		const mat = {
			opacity: 1,
			transparent: false,
			depthWrite: true,
			depthTest: true,
			blending: 2,
			userData: { __addBlend: true },
		}
		syncClassicAlphaFlags(mat, 1)
		expect(mat.blending).toBe(2)
	})
	it('is null-safe', () => {
		expect(() => syncClassicAlphaFlags(null, 1)).not.toThrow()
		expect(() => syncClassicAlphaFlags(undefined, 1)).not.toThrow()
	})
})
