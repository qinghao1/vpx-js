// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import {
	AddEquation,
	AdditiveBlending,
	CustomBlending,
	DataTexture,
	NoBlending,
	OneFactor,
	OneMinusSrcAlphaFactor,
	OneMinusSrcColorFactor,
	ReverseSubtractEquation,
	SrcAlphaFactor,
} from 'three'
import { describe, expect, it } from 'vitest'
import { clampModulateVsAdd } from '../../../vpt/flasher/flasher-blend.js'
import {
	clonePrimitiveNodeMaterial,
	convertFlasherBlend,
	createPrimitiveAdditiveMaterial,
} from './primitive-bdl-node.js'
import { graphReferences, materialize } from './tsl-test-harness.js'

/** Native AB_ADD composite (`fs_flasher.sc` REVSUBTRACT arm): `dst + L·(1 − m·(1 − dst))`. */
function flasherAdditiveComposite(dst: number, resultLight: number, resultA: number, modulate: number): number {
	const m = clampModulateVsAdd(modulate)
	const s = m * resultA * resultLight
	return dst * (1 + s) + s * (1 / m - 1)
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

/** Legacy plain-additive output the overlay used to emit (dst + src). */
function legacyAdditive(dst: number, tint: number, tex: number, intensity: number, texA: number): number {
	return dst + tint * tex * intensity * texA
}

describe('flasher AB_ADD native composite (fs_flasher.sc)', () => {
	it('matches the native blend: dst·(1−src) − src·srcAlpha', () => {
		for (const m of [0, 0.0001, 0.5, 0.9, 0.9999, 1]) {
			const mc = Math.max(0.0001, Math.min(0.9999, m))
			const resultLight = TINT_LIN * TEX_WHITE
			const resultA = INTENSITY * TEX_ALPHA
			const s = mc * resultA * resultLight
			expect(flasherAdditiveComposite(DST_DARK, resultLight, resultA, m)).toBeCloseTo(
				DST_DARK * (1 + s) + s * (1 / mc - 1),
				12,
			)
		}
	})

	it('keeps a dark backdrop dark at overdrive', () => {
		const resultLight = TINT_LIN * TEX_WHITE
		const resultA = INTENSITY * TEX_ALPHA
		const composited = flasherAdditiveComposite(DST_DARK, resultLight, resultA, MODULATE)
		expect(composited).toBeLessThan(0.05)
		const legacy = legacyAdditive(DST_DARK, TINT_LIN, TEX_WHITE, INTENSITY, TEX_ALPHA)
		expect(legacy).toBeGreaterThan(0.5)
	})

	it('is a no-op off the texture', () => {
		expect(flasherAdditiveComposite(DST_DARK, 0, INTENSITY, MODULATE)).toBeCloseTo(DST_DARK, 12)
		expect(flasherAdditiveComposite(DST_DARK, TINT_LIN, 0, MODULATE)).toBeCloseTo(DST_DARK, 12)
	})

	it('wires the native REVSUBTRACT blend when modulateVsAdd is set', () => {
		const mat = createPrimitiveAdditiveMaterial({ tint: 0x646464, intensity: INTENSITY, modulateVsAdd: 1 })
		expect(mat.blending).toBe(CustomBlending)
		expect(mat.blendSrc).toBe(SrcAlphaFactor)
		expect(mat.blendDst).toBe(OneMinusSrcColorFactor)
		expect(mat.blendEquation).toBe(ReverseSubtractEquation)
		expect(mat.blendSrcAlpha).toBe(SrcAlphaFactor)
		expect(mat.blendDstAlpha).toBe(OneMinusSrcColorFactor)
		expect(mat.blendEquationAlpha).toBe(ReverseSubtractEquation)
		const ud = mat.userData as Record<string, { value: number }>
		expect(ud.__uModulate.value).toBeCloseTo(0.9999, 12)
		expect(mat.colorNode).toBeNull()
		expect(graphReferences(materialize(mat.outputNode), ud.__uModulate)).toBe(true)
	})

	it('encodes textured AB_ADD sheets through outputNode too', () => {
		const map = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
		const mat = createPrimitiveAdditiveMaterial({ map, tint: 0x646464, intensity: INTENSITY, modulateVsAdd: 1 })
		expect(mat.colorNode).toBeNull()
		expect(graphReferences(materialize(mat.outputNode), mat.userData.__uModulate)).toBe(true)
	})

	it('keeps plain additive when modulateVsAdd is absent', () => {
		const mat = createPrimitiveAdditiveMaterial({ tint: 0x646464, intensity: INTENSITY })
		expect(mat.blending).toBe(AdditiveBlending)
		expect((mat.userData as Record<string, unknown>).__uModulate).toBeUndefined()
	})

	it('survives clonePrimitiveNodeMaterial with the encoding intact', () => {
		const mat = createPrimitiveAdditiveMaterial({ tint: 0x646464, intensity: INTENSITY, modulateVsAdd: 1 })
		const cloned = clonePrimitiveNodeMaterial(mat)
		expect(cloned.blending).toBe(CustomBlending)
		expect(cloned.blendEquation).toBe(ReverseSubtractEquation)
		const legacy = clonePrimitiveNodeMaterial(
			createPrimitiveAdditiveMaterial({ tint: 0x646464, intensity: INTENSITY }),
		)
		expect(legacy.blending).toBe(AdditiveBlending)
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
		expect(mat.outputNode).toBeNull()
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
		expect(mat.blending).toBe(CustomBlending)
		expect(mat.blendEquation).toBe(ReverseSubtractEquation)
		expect(mat.outputNode).toBeTruthy()
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
