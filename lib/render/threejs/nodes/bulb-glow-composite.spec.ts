// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { AdditiveBlending } from 'three'
import { describe, expect, it } from 'vitest'
import { clampModulateVsAdd } from '../../../vpt/flasher/flasher-blend.js'
import { createBulbGlowNodeMaterial, createMergedBulbGlowMaterial } from './bulb-glow-node.js'
import { ADDITIVE_MODULATE_DST_REF } from './primitive-bdl-node.js'
import { graphReferences, materialize } from './tsl-test-harness.js'

/**
 * Additive halo output: `dst + ((1−m) + m·d)·atten·I·l` (src alpha 1,
 * SrcAlpha/One). `ref` is the dst proxy: the sampled playfield albedo once
 * the art streams in, the reference constant before that.
 */
function bulbGlowComposite(
	dst: number,
	atten: number,
	intensity: number,
	modulate: number,
	light: number,
	ref: number = ADDITIVE_MODULATE_DST_REF,
): number {
	const m = clampModulateVsAdd(modulate)
	return dst + (1 - m + m * ref) * atten * intensity * light
}

const ATTEN = 0.8
const INTENSITY = 4
const LIGHT = 0.9
const DST = 0.1

describe('bulb-glow additive composite', () => {
	it('clamps modulate like native light.cpp (avoid 0 disabling the blend, avoid 1)', () => {
		expect(clampModulateVsAdd(undefined)).toBe(0.9)
		expect(clampModulateVsAdd(0.9)).toBe(0.9)
		expect(clampModulateVsAdd(0)).toBe(0.0001)
		expect(clampModulateVsAdd(1)).toBe(0.9999)
		expect(clampModulateVsAdd(Number.NaN)).toBe(0.9999)
	})

	it('lifts the dst by the modulated glow', () => {
		for (const m of [0, 0.0001, 0.5, 0.9, 0.9999, 1]) {
			const mc = clampModulateVsAdd(m)
			expect(bulbGlowComposite(DST, ATTEN, INTENSITY, m, LIGHT)).toBeCloseTo(
				DST + (1 - mc + mc * ADDITIVE_MODULATE_DST_REF) * ATTEN * INTENSITY * LIGHT,
				12,
			)
		}
	})

	it('reaches the 0.85 bloom threshold for lit inserts at m≈1', () => {
		// High-m insert on dark art: modulateVsAdd≈1 clamps to 0.9999.
		const dst = 0.2
		const weight = 1 - 0.9999 + 0.9999 * ADDITIVE_MODULATE_DST_REF
		const restored = bulbGlowComposite(dst, 1, 10, 0.9999, 0.8)
		expect(restored).toBeCloseTo(dst + weight * 1 * 10 * 0.8, 12)
		expect(restored).toBeGreaterThanOrEqual(0.85)
	})

	it('pins the native closed form per channel (fs_light.sc goldens)', () => {
		// Native `dst + L·((1−m) + m·dst)` with atten=1, I=10, l=0.8,
		// m=0.9999 on red art dst=(0.2, 0.1, 0.05): each channel weights by
		// its own dst, so the halo keeps the art's chroma instead of going gray.
		const mc = 0.9999
		const golden = (d: number) => d + 8 * (1 - mc + mc * d)
		expect(bulbGlowComposite(0.2, 1, 10, 0.9999, 0.8, 0.2)).toBeCloseTo(golden(0.2), 12)
		expect(bulbGlowComposite(0.1, 1, 10, 0.9999, 0.8, 0.1)).toBeCloseTo(golden(0.1), 12)
		expect(bulbGlowComposite(0.05, 1, 10, 0.9999, 0.8, 0.05)).toBeCloseTo(golden(0.05), 12)
		expect(golden(0.2)).toBeCloseTo(1.80064, 12)
		expect(golden(0.1)).toBeCloseTo(0.90072, 12)
		expect(golden(0.05)).toBeCloseTo(0.45076, 12)
	})

	it('matches native exactly once the art streams in', () => {
		// Bound tap: ref IS the backdrop, so the port reproduces the
		// native closed form `dst + L·((1−m) + m·dst)` for every lamp.
		for (const dst of [0, 0.0001, 0.05, 0.23, 0.8, 1]) {
			for (const m of [0.0001, 0.5, 0.9, 0.9999]) {
				const mc = clampModulateVsAdd(m)
				expect(bulbGlowComposite(dst, ATTEN, INTENSITY, m, LIGHT, dst)).toBeCloseTo(
					dst + (1 - mc + mc * dst) * ATTEN * INTENSITY * LIGHT,
					12,
				)
			}
		}
	})

	it('emits nothing over pure black once bound (no halo where native has none)', () => {
		// m≈1 insert on a black texel: native adds ~0; the port must too.
		expect(bulbGlowComposite(0, 1, 10, 0.9999, 0.8, 0)).toBeCloseTo(10 * 0.8 * 0.0001, 12)
	})

	it('adds the full unmodulated glow at m≈0 (native "pure additive")', () => {
		// m = 0 disables the dst coupling entirely: the lamp adds its full
		// glow regardless of the backdrop.
		expect(bulbGlowComposite(DST, ATTEN, INTENSITY, 0.0001, LIGHT)).toBeCloseTo(DST + ATTEN * INTENSITY * LIGHT, 3)
	})

	it('wires additive blending on the per-quad material', () => {
		// The negatively-encoded REVSUBTRACT form this replaced draws
		// nothing on the WebGPU backend (program runs, fragments stay dst).
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
		expect(mat.blending).toBe(AdditiveBlending)
		const ud = mat.userData as Record<string, { value: number }>
		expect(ud.__uModulate.value).toBeCloseTo(0.9, 12)
		expect(graphReferences(materialize(mat.colorNode), ud.__uModulate)).toBe(true)
	})

	it('wires additive blending on the merged material', () => {
		const mat = createMergedBulbGlowMaterial()
		expect(mat.blending).toBe(AdditiveBlending)
	})
})
