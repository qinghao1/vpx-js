// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { CustomBlending, OneMinusSrcColorFactor, ReverseSubtractEquation, SrcAlphaFactor } from 'three'
import { describe, expect, it } from 'vitest'
import {
	bulbGlowComposite,
	bulbGlowSrcAlpha,
	clampBulbModulateVsAdd,
	createBulbGlowNodeMaterial,
	createMergedBulbGlowMaterial,
} from './bulb-glow-node.js'
import { graphReferences, materialize } from './tsl-test-harness.js'

const ATTEN = 0.8
const INTENSITY = 4
const LIGHT = 0.9
const DST = 0.1

/** Legacy (buggy) sliver the halo used to emit: atten·I·l·(1−m) added, dst untouched. */
function legacySliver(dst: number, atten: number, intensity: number, modulate: number, light: number): number {
	return dst + atten * intensity * light * (1 - modulate)
}

describe('bulb-glow native composite (fs_light.sc)', () => {
	it('clamps modulate like native light.cpp (avoid 0 disabling the blend, avoid 1)', () => {
		expect(clampBulbModulateVsAdd(undefined)).toBe(0.9)
		expect(clampBulbModulateVsAdd(0.9)).toBe(0.9)
		expect(clampBulbModulateVsAdd(0)).toBe(0.0001)
		expect(clampBulbModulateVsAdd(1)).toBe(0.9999)
	})

	it('matches the hand-expanded native blend: dst·(1−src) − src·srcAlpha', () => {
		for (const m of [0, 0.0001, 0.5, 0.9, 0.9999, 1]) {
			const mc = clampBulbModulateVsAdd(m)
			const src = -mc * ATTEN * INTENSITY * LIGHT
			const srcAlpha = 1 / mc - 1
			const expected = DST * (1 - src) - src * srcAlpha
			expect(bulbGlowComposite(DST, ATTEN, INTENSITY, m, LIGHT)).toBeCloseTo(expected, 12)
		}
	})

	it('restores insert energy at m≈1 so lit inserts reach the 0.85 bloom threshold', () => {
		// Royal Flush 1976-style insert: modulateVsAdd≈1 clamps to 0.9999, dark art.
		const dst = 0.2
		const glow = 1 * 10 * 0.8
		const restored = bulbGlowComposite(dst, 1, 10, 0.9999, 0.8)
		expect(restored).toBeCloseTo(dst * (1 + 0.9999 * glow) + 0.0001 * glow, 12)
		expect(restored).toBeGreaterThanOrEqual(0.85)
		const legacy = legacySliver(dst, 1, 10, 0.9999, 0.8)
		expect(legacy).toBeLessThan(0.85)
		expect(restored / Math.max(legacy - dst, 1e-12)).toBeGreaterThan(100)
	})

	it('degenerates to pure additive at m≈0 (legacy behavior preserved)', () => {
		expect(bulbGlowComposite(DST, ATTEN, INTENSITY, 0.0001, LIGHT)).toBeCloseTo(DST + ATTEN * INTENSITY * LIGHT, 3)
	})

	it('encodes the native src alpha 1/m − 1', () => {
		expect(bulbGlowSrcAlpha(0.9)).toBeCloseTo(1 / 0.9 - 1, 12)
		expect(bulbGlowSrcAlpha(0.9999)).toBeCloseTo(0.0001, 6)
	})

	it('wires the native blend state on the per-quad material', () => {
		const mat = createBulbGlowNodeMaterial({
			color: 0xffffff,
			color2: 0xffffff,
			centerX: 0,
			centerY: 0,
			falloff: 100,
			falloffPower: 2,
			intensity: 10,
			modulateVsAdd: 0.9,
		})
		expect(mat.blending).toBe(CustomBlending)
		expect(mat.blendSrc).toBe(SrcAlphaFactor)
		expect(mat.blendDst).toBe(OneMinusSrcColorFactor)
		expect(mat.blendEquation).toBe(ReverseSubtractEquation)
		expect(mat.blendSrcAlpha).toBe(SrcAlphaFactor)
		expect(mat.blendDstAlpha).toBe(OneMinusSrcColorFactor)
		expect(mat.blendEquationAlpha).toBe(ReverseSubtractEquation)
		const ud = mat.userData as Record<string, { value: number }>
		expect(ud.__uModulate.value).toBeCloseTo(0.9, 12)
		expect(graphReferences(materialize(mat.colorNode), ud.__uModulate)).toBe(true)
	})

	it('wires the native blend state on the merged material', () => {
		const mat = createMergedBulbGlowMaterial()
		expect(mat.blending).toBe(CustomBlending)
		expect(mat.blendSrc).toBe(SrcAlphaFactor)
		expect(mat.blendDst).toBe(OneMinusSrcColorFactor)
		expect(mat.blendEquation).toBe(ReverseSubtractEquation)
	})
})
