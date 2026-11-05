// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import {
	AddEquation,
	AdditiveBlending,
	CustomBlending,
	DataTexture,
	NoBlending,
	OneFactor,
	OneMinusSrcAlphaFactor,
} from 'three'
import { describe, expect, it } from 'vitest'
import { clampModulateVsAdd } from '../../../vpt/flasher/flasher-blend.js'
import {
	ADDITIVE_MODULATE_DST_REF,
	clonePrimitiveNodeMaterial,
	convertFlasherBlend,
	createPrimitiveAdditiveMaterial,
} from './primitive-bdl-node.js'
import { graphReferences, materialize } from './tsl-test-harness.js'

/**
 * AB_ADD composite: `dst + ((1−m) + m·d)·resultA·resultLight` (src alpha 1,
 * SrcAlpha/One). `ref` is the dst proxy: sampled playfield albedo once the
 * art streams in, the reference constant before that.
 */
function flasherAdditiveComposite(
	dst: number,
	resultLight: number,
	resultA: number,
	modulate: number,
	ref: number = ADDITIVE_MODULATE_DST_REF,
): number {
	const m = clampModulateVsAdd(modulate)
	return dst + (1 - m + m * ref) * resultA * resultLight
}

/** Native AB_ABSORB composite (`fs_flasher.sc` absorb arm, premultiplied-over). */
function flasherAbsorbComposite(
	dst: number,
	tint: number,
	tex: number,
	texA: number,
	intensity: number,
	modulate: number,
): number {
	const m = clampModulateVsAdd(modulate)
	const resultA = texA * intensity
	return tint * tex * resultA + dst * (1 - Math.min(1, m * resultA))
}

/** Native AB_NONE output (`fs_flasher.sc` plain arm, blending disabled). */
function flasherPlainComposite(tint: number, tex: number): number {
	return tint * tex
}

// Overdrive: dark backdrop stays modulated.
const DST_DARK = 0.02
const TINT_LIN = 0.1272 // three linear working-space value of authored 0x646464
const TEX_WHITE = 1
const TEX_ALPHA = 1
const INTENSITY = 5.005 // alpha 500.5 * intensityScale 1 / 100, as the updater computes
const MODULATE = 1

describe('flasher AB_ADD additive composite', () => {
	it('lifts the dst by the modulated glow', () => {
		for (const m of [0, 0.0001, 0.5, 0.9, 0.9999, 1]) {
			const mc = Math.max(0.0001, Math.min(0.9999, m))
			const resultLight = TINT_LIN * TEX_WHITE
			const resultA = INTENSITY * TEX_ALPHA
			expect(flasherAdditiveComposite(DST_DARK, resultLight, resultA, m)).toBeCloseTo(
				DST_DARK + (1 - mc + mc * ADDITIVE_MODULATE_DST_REF) * resultA * resultLight,
				12,
			)
		}
	})

	it('adds the full unmodulated glow at m≈0 (native "pure additive")', () => {
		expect(flasherAdditiveComposite(DST_DARK, TINT_LIN * TEX_WHITE, INTENSITY * TEX_ALPHA, 0.0001)).toBeCloseTo(
			DST_DARK + TINT_LIN * TEX_WHITE * INTENSITY * TEX_ALPHA,
			1,
		)
	})

	it('matches native exactly once the art streams in', () => {
		// Bound tap: ref IS the backdrop, so the port reproduces the
		// native closed form `dst + resultA·resultLight·((1−m) + m·dst)`.
		for (const dst of [0, 0.02, 0.23, 0.8]) {
			for (const m of [0.0001, 0.5, 0.9, 0.9999]) {
				const mc = clampModulateVsAdd(m)
				const resultLight = TINT_LIN * TEX_WHITE
				const resultA = INTENSITY * TEX_ALPHA
				expect(flasherAdditiveComposite(dst, resultLight, resultA, m, dst)).toBeCloseTo(
					dst + (1 - mc + mc * dst) * resultA * resultLight,
					12,
				)
			}
		}
	})

	it('is a no-op off the texture', () => {
		expect(flasherAdditiveComposite(DST_DARK, 0, INTENSITY, MODULATE)).toBeCloseTo(DST_DARK, 12)
		expect(flasherAdditiveComposite(DST_DARK, TINT_LIN, 0, MODULATE)).toBeCloseTo(DST_DARK, 12)
	})

	it('pins the native closed form per channel (fs_flasher.sc golden)', () => {
		// Native `dst + resultA·resultLight·((1−m) + m·dst)` with resultA =
		// 5.005, resultLight = 0.1272, m = 0.9999 on dst = 0.02.
		const mc = 0.9999
		const golden = 0.02 + 5.005 * 0.1272 * (1 - mc + mc * 0.02)
		expect(flasherAdditiveComposite(0.02, TINT_LIN * TEX_WHITE, INTENSITY * TEX_ALPHA, 0.9999, 0.02)).toBeCloseTo(
			golden,
			12,
		)
		expect(golden).toBeCloseTo(0.0327951, 6)
	})

	it('wires additive blending when modulateVsAdd is set', () => {
		// The negatively-encoded REVSUBTRACT form this replaced draws
		// nothing on the WebGPU backend (program runs, fragments stay dst).
		const mat = createPrimitiveAdditiveMaterial({ tint: 0x646464, intensity: INTENSITY, modulateVsAdd: 1 })
		expect(mat.blending).toBe(AdditiveBlending)
		const ud = mat.userData as Record<string, { value: number }>
		expect(ud.__uModulate.value).toBeCloseTo(0.9999, 12)
		expect(graphReferences(materialize(mat.colorNode), ud.__uModulate)).toBe(true)
	})

	it('keeps plain additive when modulateVsAdd is absent', () => {
		const mat = createPrimitiveAdditiveMaterial({ tint: 0x646464, intensity: INTENSITY })
		expect(mat.blending).toBe(AdditiveBlending)
		expect((mat.userData as Record<string, unknown>).__uModulate).toBeUndefined()
	})

	it('survives clonePrimitiveNodeMaterial with the encoding intact', () => {
		const mat = createPrimitiveAdditiveMaterial({ tint: 0x646464, intensity: INTENSITY, modulateVsAdd: 1 })
		const cloned = clonePrimitiveNodeMaterial(mat)
		expect(cloned.blending).toBe(AdditiveBlending)
		const legacy = clonePrimitiveNodeMaterial(
			createPrimitiveAdditiveMaterial({ tint: 0x646464, intensity: INTENSITY }),
		)
		expect(legacy.blending).toBe(AdditiveBlending)
	})

	it('taps the playfield albedo on both AB_ADD arms', () => {
		// Textured and untextured modulate arms sample the backdrop as the
		// native dst; other arms carry no tap.
		const textured = createPrimitiveAdditiveMaterial({
			tint: 0x646464,
			intensity: INTENSITY,
			modulateVsAdd: 1,
			map: new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1),
			mapName: 'sheet',
		})
		const untextured = createPrimitiveAdditiveMaterial({ tint: 0x646464, intensity: INTENSITY, modulateVsAdd: 1 })
		const plain = createPrimitiveAdditiveMaterial({ tint: 0x646464, intensity: INTENSITY, plain: true })
		for (const mat of [textured, untextured]) {
			const ud = mat.userData as Record<string, unknown>
			expect(ud.__backdropArm).toBe(true)
			const nodes = ud.__backdropNodes as { value: unknown }[]
			expect(nodes).toHaveLength(1)
			expect(graphReferences(materialize(mat.colorNode), nodes[0])).toBe(true)
		}
		expect((plain.userData as Record<string, unknown>).__backdropArm ?? false).toBe(false)
	})

	it('replays the backdrop binding across clonePrimitiveNodeMaterial', () => {
		const art = new DataTexture(new Uint8Array([10, 20, 30, 255]), 1, 1)
		const mat = createPrimitiveAdditiveMaterial({
			tint: 0x646464,
			intensity: INTENSITY,
			modulateVsAdd: 1,
			backdropMap: art,
			backdropMapName: 'pf',
		})
		const cloned = clonePrimitiveNodeMaterial(mat) as unknown as {
			userData: Record<string, unknown>
		}
		expect(cloned.userData.__backdropName).toBe('pf')
		const nodes = cloned.userData.__backdropNodes as { value: unknown }[]
		expect(nodes?.[0]?.value).toBe(art)
	})
})

describe('flasher AB_ABSORB native composite (fs_flasher.sc absorb arm)', () => {
	it('matches the native composite: src + dst·(1 − srcA)', () => {
		for (const m of [0, 0.0001, 0.5, 0.9, 0.9999, 1]) {
			const mc = Math.max(0.0001, Math.min(0.9999, m))
			const resultA = TEX_ALPHA * INTENSITY
			const src = TINT_LIN * TEX_WHITE * resultA
			expect(flasherAbsorbComposite(DST_DARK, TINT_LIN, TEX_WHITE, TEX_ALPHA, INTENSITY, m)).toBeCloseTo(
				src + DST_DARK * (1 - Math.min(1, mc * resultA)),
				12,
			)
		}
	})

	it('saturates the src alpha at overdrive', () => {
		const composited = flasherAbsorbComposite(DST_DARK, TINT_LIN, TEX_WHITE, TEX_ALPHA, INTENSITY, MODULATE)
		expect(composited).toBeCloseTo(TINT_LIN * TEX_WHITE * INTENSITY, 12)
	})

	it('wires the positive premultiplied-over encoding when absorb is set', () => {
		const mat = createPrimitiveAdditiveMaterial({
			tint: 0x646464,
			intensity: INTENSITY,
			modulateVsAdd: 1,
			absorb: true,
		})
		expect(mat.blending).toBe(CustomBlending)
		expect(mat.blendSrc).toBe(OneFactor)
		expect(mat.blendDst).toBe(OneMinusSrcAlphaFactor)
		expect(mat.blendEquation).toBe(AddEquation)
		const ud = mat.userData as Record<string, { value: number }>
		expect(ud.__uModulate.value).toBeCloseTo(0.9999, 12)
		expect(graphReferences(materialize(mat.colorNode), ud.__uModulate)).toBe(true)
	})

	it('survives clonePrimitiveNodeMaterial with the absorb encoding intact', () => {
		const mat = createPrimitiveAdditiveMaterial({
			tint: 0x646464,
			intensity: INTENSITY,
			modulateVsAdd: 1,
			absorb: true,
		})
		const cloned = clonePrimitiveNodeMaterial(mat)
		expect(cloned.blending).toBe(CustomBlending)
		expect(cloned.blendSrc).toBe(OneFactor)
		expect(cloned.blendDst).toBe(OneMinusSrcAlphaFactor)
	})
})

describe('flasher AB_NONE plain output (fs_flasher.sc plain arm)', () => {
	it('emits opaque static color', () => {
		expect(flasherPlainComposite(TINT_LIN, TEX_WHITE)).toBeCloseTo(TINT_LIN * TEX_WHITE, 12)
	})

	it('converts an absorb overlay to opaque static color', () => {
		const mat = createPrimitiveAdditiveMaterial({
			tint: 0x646464,
			intensity: INTENSITY,
			modulateVsAdd: 1,
			absorb: true,
		})
		expect(convertFlasherBlend(mat, 'plain')).toBe(true)
		expect(mat.blending).toBe(NoBlending)
		expect(mat.transparent).toBe(true)
		expect(mat.userData.__blend).toBe('plain')
		const ud = mat.userData as Record<string, { value: unknown }>
		expect(graphReferences(materialize(mat.colorNode), ud.__uTint)).toBe(true)
		expect(convertFlasherBlend(mat, 'plain')).toBe(false)
	})

	it('restores the additive encoding on conversion back', () => {
		const mat = createPrimitiveAdditiveMaterial({
			tint: 0x646464,
			intensity: INTENSITY,
			modulateVsAdd: 1,
			absorb: true,
		})
		convertFlasherBlend(mat, 'plain')
		expect(convertFlasherBlend(mat, 'additive')).toBe(true)
		expect(mat.blending).toBe(AdditiveBlending)
		expect(mat.transparent).toBe(true)
		expect(mat.userData.__blend).toBe('additive')
	})

	it('applies the stashed cutout only for the plain target', () => {
		const mat = createPrimitiveAdditiveMaterial({
			tint: 0x646464,
			intensity: INTENSITY,
			modulateVsAdd: 1,
			absorb: true,
			alphaTestValue: 0.5,
		})
		expect(mat.alphaTest).toBe(0)
		convertFlasherBlend(mat, 'plain')
		expect(mat.alphaTest).toBe(0.5)
		convertFlasherBlend(mat, 'additive')
		expect(mat.alphaTest).toBe(0)
	})

	it('keeps the cutout across clones of plain overlays', () => {
		const mat = createPrimitiveAdditiveMaterial({
			tint: 0x646464,
			intensity: INTENSITY,
			modulateVsAdd: 1,
			absorb: true,
			alphaTestValue: 0.5,
		})
		convertFlasherBlend(mat, 'plain')
		const cloned = clonePrimitiveNodeMaterial(mat)
		expect(cloned.userData.__blend).toBe('plain')
		expect(cloned.alphaTest).toBe(0.5)
	})
})
