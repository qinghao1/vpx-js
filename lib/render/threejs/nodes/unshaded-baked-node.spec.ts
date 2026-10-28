import { DataTexture } from 'three'
import { describe, expect, it } from 'vitest'
import {
	getTransmissionDebug,
	getTransmissionTexture,
	resetTransmissionBuffer,
	updateTransmissionBuffer,
} from '../transmission-buffer.js'
import { asOperand, collectNodes, graphReferences, materialize, type TslOperand } from './tsl-test-harness.js'
import { createUnshadedBakedNodeMaterial } from './unshaded-baked-node.js'

function whiteTex(): DataTexture {
	const tex = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
	tex.needsUpdate = true
	return tex
}

function tintUniformOf(mat: unknown): unknown {
	return (mat as { userData: Record<string, unknown> }).userData.__uTint
}

describe('unshaded baked bulb math (upstream fs_basic.sc tail)', () => {
	it('applies sqrt to the unlit diffuse, never the lit result', () => {
		// Upstream: sqrt(diffuse) with diffuse = the unlit texel
		// (fs_basic.sc: sqrt(diffuse)*bulb*color.a), matching the BDL lift
		// (primitive-bdl-node.ts: sqrt(diffuse)). Taking the root after the
		// bulb field lands would dim lit inserts instead of lifting them.
		const mat = createUnshadedBakedNodeMaterial({ map: whiteTex() })
		const color = materialize(mat.colorNode)
		const sqrtNodes = collectNodes(color).filter(node => node.isMathNode === true && node.method === 'sqrt')
		expect(sqrtNodes.length, 'exactly one sqrt term in the baked graph').toBe(1)
		const operand = asOperand(sqrtNodes[0]?.aNode)
		expect(operand, 'sqrt has an operand').not.toBe(null)
		expect(graphReferences(operand, tintUniformOf(mat)), 'sqrt feeds on the tinted albedo').toBe(true)
		expect(graphReferences(operand, getTransmissionTexture()), 'sqrt input reads no buffer').toBe(false)
	})

	it('adds the buffer-gated lift onto the unmodified albedo', () => {
		// Upstream consumes the bulb buffer exactly once, as an addition on
		// top of the lit color; the diffuse itself is never scaled by the
		// field. The baked graph must therefore split at one top-level add
		// into a buffer-free base (the tinted albedo) and a buffer-fed lift.
		const mat = createUnshadedBakedNodeMaterial({ map: whiteTex() })
		const color = materialize(mat.colorNode)
		const transTex = getTransmissionTexture()
		// Implementation-coupled by design: 'OperatorNode' is a three.js
		// internal class name (three@0.185, see package.json). If a three
		// upgrade breaks this pin, re-derive the split from the behavior
		// asserts below (base keeps tint, lift reads the buffer) instead of
		// weakening them.
		const splits = collectNodes(color).filter(
			node =>
				(node as { constructor?: { name?: string } }).constructor?.name === 'OperatorNode' &&
				node.op === '+' &&
				graphReferences(node.aNode, transTex) !== graphReferences(node.bNode, transTex),
		)
		expect(splits.length, 'one base+lift split in the baked graph').toBe(1)
		const split = splits[0] as TslOperand
		const lift = graphReferences(split.aNode, transTex) ? split.aNode : split.bNode
		const base = lift === split.aNode ? split.bNode : split.aNode
		expect(graphReferences(base, tintUniformOf(mat)), 'base keeps the tinted albedo').toBe(true)
		expect(graphReferences(base, transTex), 'base reads no bulb buffer').toBe(false)
		expect(graphReferences(lift, transTex), 'lift reads the transmission buffer').toBe(true)
		expect(
			collectNodes(lift).some(node => node.isMathNode === true && node.method === 'sqrt'),
			'lift rides the sqrt term',
		).toBe(true)
	})

	it('renders the albedo unchanged when the lamps are off', () => {
		// Lamp-off identity: with every lamp dark the transmission buffer
		// stays black, so the multiplicatively gated lift contributes nothing
		// and the bake emits exactly its albedo (the TWD apron case).
		resetTransmissionBuffer()
		const table = {
			data: { right: 1000, bottom: 2000 },
			lights: {
				bulb: {
					data: {
						center: { x: 500, y: 1000 },
						intensity: 50,
						color: 0xff0000,
						bulbLight: true,
						transmissionScale: 1,
						falloff: 200,
						falloffPower: 2,
					},
					getState: () => ({ intensity: 0, color: 0xff0000 }),
				},
				plain: {
					data: { center: { x: 100, y: 100 }, intensity: 0 },
					getState: () => ({ intensity: 0 }),
				},
			},
		} as never
		expect(updateTransmissionBuffer(table)).toBe(true)
		expect(getTransmissionDebug().peak, 'lamps off leaves the buffer black').toBe(0)
		const data = getTransmissionTexture().image.data as Uint16Array
		let peak = 0
		for (let index = 0; index < data.length; index++) peak = Math.max(peak, data[index] ?? 0)
		expect(peak, 'no texel carries lamp energy').toBe(0)
	})
})
