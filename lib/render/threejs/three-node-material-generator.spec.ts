// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE
import { DataTexture } from 'three'
import { describe, expect, it } from 'vitest'
import { graphReferences, materialize } from './nodes/tsl-test-harness.js'
import { ThreeNodeMaterialGenerator } from './three-node-material-generator.js'

/** Named-arg helper over getMaterial's positional params for the additive path. */
function additiveMaterial({ mapName }: { mapName: string }): any {
	const tex = new DataTexture(new Uint8Array([255, 128, 64, 255]), 1, 1)
	tex.name = mapName
	const generator = new ThreeNodeMaterialGenerator({
		hasTexture: () => true,
		getTexture: () => tex,
	} as any)
	return generator.getMaterial(undefined, mapName, undefined, undefined, undefined, true, 0, undefined, true)
}

describe('additive blend parity (upstream flasher.cpp SetupAddBlendState)', () => {
	it('scales the positive tint/intensity uniforms on plain additive', () => {
		// AB_ADD stays plain additive by design; see applyAbsorbBlendState.
		const add = additiveMaterial({ mapName: 'flashA' })
		const dag = materialize(add.colorNode)
		expect(graphReferences(dag, add.userData.__uTint), 'additive output scales the positive tint').toBe(true)
		expect(graphReferences(dag, add.userData.__uIntensity), 'additive output scales the positive intensity').toBe(
			true,
		)
	})
})
