import { DataTexture } from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import { getTransmissionTexture } from '../transmission-buffer.js'
import {
	BULB_LIFT_BELOW_EPS,
	createPrimitiveBdlMaterial,
	setPrimitiveTransmissionArea,
	uPlayfieldSurfaceY,
	uTransArea,
} from './primitive-bdl-node.js'
import { graphReferences, materialize } from './tsl-test-harness.js'
import { createUnshadedBakedNodeMaterial } from './unshaded-baked-node.js'

const savedArea = uTransArea.value.clone()
const savedSurfaceY = uPlayfieldSurfaceY.value

afterEach(() => {
	uTransArea.value.copy(savedArea)
	uPlayfieldSurfaceY.value = savedSurfaceY
})

function whiteTex(): DataTexture {
	const tex = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
	tex.needsUpdate = true
	return tex
}

describe('bulb-lift volume (below-cabinet light leak)', () => {
	it('anchors the height gate to the built playfield plane', () => {
		// Surface defaults to the unpositioned table plane (y=0); the viewer
		// overwrites it with the measured table z=0 height after scene build.
		setPrimitiveTransmissionArea(952, 2247, 0.05)
		expect(uTransArea.value.x).toBeCloseTo(47.6, 5)
		expect(uTransArea.value.y).toBeCloseTo(112.35, 5)
		expect(uPlayfieldSurfaceY.value).toBe(0)
		setPrimitiveTransmissionArea(952, 2247, 0.05, 2.5)
		expect(uPlayfieldSurfaceY.value).toBe(2.5)
		setPrimitiveTransmissionArea(952, 2247, 0.05, Number.NaN)
		expect(uPlayfieldSurfaceY.value).toBe(0)
	})

	it('keeps the cutoff between extruded overlays and the cabinet body', () => {
		// TWD measures: VLM bake/lightmap skirts hang ~1.1 units below the
		// surface and must keep their lamp response, while the cabinet bottom
		// (~4 down) and under-table grates must stay dark.
		expect(BULB_LIFT_BELOW_EPS).toBeGreaterThan(1.1)
		expect(BULB_LIFT_BELOW_EPS).toBeLessThan(4)
	})

	it('gates the BDL transmission lift on the lift volume', () => {
		// Regression: the footprint-only mask passes below-playfield
		// fragments sharing the playfield x/z (grates, floors), smearing live
		// lamp discs onto the floor beneath the cabinet. Upstream samples its
		// bulb buffer in screen space (fs_basic.sc:263), which never reaches
		// occluded below-table pixels.
		const mat = createPrimitiveBdlMaterial({ map: whiteTex() })
		const emissive = materialize(mat.emissiveNode)
		expect(graphReferences(emissive, getTransmissionTexture())).toBe(true)
		expect(graphReferences(emissive, uPlayfieldSurfaceY)).toBe(true)
	})

	it('leaves untextured BDL solids out of the buffer path entirely', () => {
		// Opaque solids (cabinet bottom, legs) take the unlit-carry branch,
		// so no bulb lookup exists to leak through them in the first place.
		const mat = createPrimitiveBdlMaterial({})
		const emissive = materialize(mat.emissiveNode)
		expect(graphReferences(emissive, getTransmissionTexture())).toBe(false)
		expect(graphReferences(emissive, uPlayfieldSurfaceY)).toBe(false)
	})

	it('gates the baked bulb lift on the lift volume (no diffuse multiply)', () => {
		// Upstream consumes the bulb buffer exactly once, as the fs_basic.sc
		// additive sqrt(diffuse) tail: the baked base stays the unlit albedo
		// and only the lift reads the single transmission buffer.
		const mat = createUnshadedBakedNodeMaterial({ map: whiteTex() })
		const color = materialize(mat.colorNode)
		expect(graphReferences(color, getTransmissionTexture())).toBe(true)
		expect(graphReferences(color, uPlayfieldSurfaceY)).toBe(true)
	})

	it('leaves untextured baked solids out of the buffer path entirely', () => {
		const mat = createUnshadedBakedNodeMaterial({})
		const color = materialize(mat.colorNode)
		expect(graphReferences(color, getTransmissionTexture())).toBe(false)
		expect(graphReferences(color, uPlayfieldSurfaceY)).toBe(false)
	})
})
