import { DataTexture } from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import { getLightBufferTexture, getTransmissionTexture } from '../transmission-buffer.js'
import {
	BULB_LIFT_BELOW_EPS,
	createPrimitiveBdlMaterial,
	setPrimitiveTransmissionArea,
	uPlayfieldSurfaceY,
	uTransArea,
} from './primitive-bdl-node.js'
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

/**
 * Eagerly runs a lazy TSL Fn body (three keeps `Fn()()` closures unbuilt
 * until backend compile: VarNode -> call -> jsFunc) so the spec can inspect
 * the real node DAG. Falls back to the raw node if internals change, which
 * fails the gate tests loudly instead of passing silently.
 */
function materialize(node: unknown): unknown {
	let current = node as Record<string, unknown> | null | undefined
	if (current && typeof current === 'object' && current.node && typeof current.node === 'object') {
		current = current.node as Record<string, unknown>
	}
	if (current && typeof current === 'object' && current.shaderNode && typeof current.shaderNode === 'object') {
		current = current.shaderNode as Record<string, unknown>
	}
	if (current && typeof current === 'object' && typeof current.jsFunc === 'function') {
		return (current.jsFunc as () => unknown)()
	}
	return node
}

/**
 * Structural check: does the TSL node DAG under `root` reference `target`
 * (by identity)? The lift gates live inside Fn closures, so the spec
 * materializes them and pins gate presence by the shared uniform/texture
 * instance instead of pixels.
 */
function graphReferences(root: unknown, target: unknown): boolean {
	const seen = new Set<unknown>()
	const stack: unknown[] = [root]
	while (stack.length > 0) {
		const node = stack.pop()
		if (!node || typeof node !== 'object' || seen.has(node)) continue
		seen.add(node)
		if (node === target) return true
		for (const key of Object.keys(node)) {
			const value = (node as Record<string, unknown>)[key]
			if (value && typeof value === 'object') stack.push(value)
		}
	}
	return false
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

	it('gates the baked bulb-field multiply and lift on the lift volume', () => {
		const mat = createUnshadedBakedNodeMaterial({ map: whiteTex() })
		const color = materialize(mat.colorNode)
		expect(graphReferences(color, getLightBufferTexture())).toBe(true)
		expect(graphReferences(color, getTransmissionTexture())).toBe(true)
		expect(graphReferences(color, uPlayfieldSurfaceY)).toBe(true)
	})

	it('leaves untextured baked solids out of the buffer path entirely', () => {
		const mat = createUnshadedBakedNodeMaterial({})
		const color = materialize(mat.colorNode)
		expect(graphReferences(color, getLightBufferTexture())).toBe(false)
		expect(graphReferences(color, getTransmissionTexture())).toBe(false)
		expect(graphReferences(color, uPlayfieldSurfaceY)).toBe(false)
	})
})
