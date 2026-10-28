// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE
import { AdditiveBlending, CustomBlending, DataTexture, OneFactor } from 'three'
import { describe, expect, it } from 'vitest'
import { graphReferences, materialize } from './nodes/tsl-test-harness.js'
import { ThreeNodeMaterialGenerator } from './three-node-material-generator.js'

function texturedGenerator(mapName: string): ThreeNodeMaterialGenerator {
	const tex = new DataTexture(new Uint8Array([255, 128, 64, 255]), 1, 1)
	tex.name = mapName
	return new ThreeNodeMaterialGenerator({
		hasTexture: () => true,
		getTexture: () => tex,
	} as any)
}

describe('additive blend parity (upstream flasher.cpp SetupAddBlendState)', () => {
	it('keeps AB_ADD on plain additive: REVSUBTRACT needs the negative shader encoding', () => {
		// Upstream AB_ADD is SRC_ALPHA/INVSRC_COLOR/REVSUBTRACT, which only
		// amplifies because fs_flasher.sc encodes its output negative (signed
		// modulateVsAdd). This node's output is positive premultiplied color,
		// so flipping the blend alone would darken (dst*(1-src) - src*srcAlpha).
		const generator = texturedGenerator('flashA')
		const add = (generator as any).getMaterial(
			undefined,
			'flashA',
			undefined,
			undefined,
			undefined,
			true,
			0,
			undefined,
			true,
			undefined,
			0,
			1,
		)
		expect(add.blending, 'AB_ADD must stay plain additive').toBe(AdditiveBlending)
		expect(add.userData.__addBlend, 'AB_ADD stays an overlay').toBe(true)
		expect(add.userData.__absorbBlend, 'AB_ADD must not absorb').toBeFalsy()
		// The encoding side of the same reason: the textured output scales
		// the positive tint/intensity uniforms, never a negated term.
		const dag = materialize(add.colorNode)
		expect(graphReferences(dag, add.userData.__uTint), 'additive output scales the positive tint').toBe(true)
		expect(graphReferences(dag, add.userData.__uIntensity), 'additive output scales the positive intensity').toBe(
			true,
		)
	})

	it('routes AB_ABSORB through the shared premultiplied-over helper', () => {
		const generator = texturedGenerator('flashB')
		const absorb = (generator as any).getMaterial(
			undefined,
			'flashB',
			undefined,
			undefined,
			undefined,
			true,
			0,
			undefined,
			true,
			undefined,
			0,
			2,
		)
		expect(absorb.blending, 'absorb must be custom, not additive').toBe(CustomBlending)
		expect(absorb.blendSrc, 'absorb src factor (ONE)').toBe(OneFactor)
		expect(absorb.userData.__absorbBlend, 'absorb marker').toBe(true)
	})
})
