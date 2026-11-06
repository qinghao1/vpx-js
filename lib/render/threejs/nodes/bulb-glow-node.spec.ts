import { CustomBlending, OneMinusSrcColorFactor, ReverseSubtractEquation, SrcAlphaFactor } from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import { createBulbGlowNodeMaterial, isBulbGlowMaterial, setBulbGlowState } from './bulb-glow-node.js'
import {
	setPrimitiveTransmissionArea,
	uBulbGlowFootprintClip,
	uPlayfieldSurfaceY,
	uTransArea,
} from './primitive-bdl-node.js'
import { graphReferences, materialize } from './tsl-test-harness.js'

// setPrimitiveTransmissionArea mutates shared playfield-area module state;
// restore it so this file stays order-independent.
const savedArea = uTransArea.value.clone()
const savedSurfaceY = uPlayfieldSurfaceY.value
const savedClip = uBulbGlowFootprintClip.value

afterEach(() => {
	uTransArea.value.copy(savedArea)
	uPlayfieldSurfaceY.value = savedSurfaceY
	uBulbGlowFootprintClip.value = savedClip
})

describe('bulb glow node material', () => {
	it('should create a flagged native-composite material', () => {
		const mat = createBulbGlowNodeMaterial({
			color: 0xff6020,
			color2: 0xffffff,
			centerX: 500,
			centerY: 1000,
			falloff: 300,
			falloffPower: 2,
			intensity: 10,
		})
		expect(isBulbGlowMaterial(mat)).toBe(true)
		expect(mat.transparent).toBe(true)
		expect(mat.depthWrite).toBe(false)
		expect(mat.outputNode).toBeTruthy()
		// Full fs_light.sc composite via the blend unit: REVSUBTRACT with
		// SRC_ALPHA/INV_SRC_COLOR over the post-opaque scene color, fed the
		// negatively-encoded shader output. Runs in the pipeline scene
		// pass's transparent phase, so no extra pass is needed.
		expect(mat.blending, 'bulb halo composites with the native blend state').toBe(CustomBlending)
		expect(mat.blendSrc).toBe(SrcAlphaFactor)
		expect(mat.blendDst).toBe(OneMinusSrcColorFactor)
		expect(mat.blendEquation).toBe(ReverseSubtractEquation)
	})

	it('should store the clamped modulateVsAdd for the negative encoding', () => {
		const additive = createBulbGlowNodeMaterial({
			color: 0xffffff,
			color2: 0xffffff,
			centerX: 0,
			centerY: 0,
			falloff: 100,
			falloffPower: 2,
			intensity: 10,
			modulateVsAdd: 0,
		})
		const modulated = createBulbGlowNodeMaterial({
			color: 0xffffff,
			color2: 0xffffff,
			centerX: 0,
			centerY: 0,
			falloff: 100,
			falloffPower: 2,
			intensity: 10,
			modulateVsAdd: 0.9,
		})
		const modulateOf = (mat: unknown): number => (mat as any).userData.__uModulate.value as number
		expect(modulateOf(additive)).toBeCloseTo(0.0001, 4)
		expect(modulateOf(modulated)).toBeCloseTo(0.9, 4)
		expect(isBulbGlowMaterial(modulated)).toBe(true)
	})

	it('should update live lamp state', () => {
		const mat = createBulbGlowNodeMaterial({
			color: 0xff0000,
			color2: 0xffffff,
			centerX: 0,
			centerY: 0,
			falloff: 100,
			falloffPower: 2,
			intensity: 0,
		})
		const uniforms = mat.userData as any
		expect(uniforms.__uIntensity.value).toBe(0)
		expect(uniforms.__uColor.value.getHex()).toBe(0xff0000)
		setBulbGlowState(mat, { intensity: 12, color: 0x00ff00 })
		expect(uniforms.__uIntensity.value).toBe(12)
		expect(uniforms.__uColor.value.getHex()).toBe(0x00ff00)
		expect(isBulbGlowMaterial(mat)).toBe(true)
		expect(() => setBulbGlowState({}, { intensity: 5 })).not.toThrow()
	})

	it('should restamp modulate in place without rebuilding', () => {
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
		const uniforms = mat.userData as any
		setBulbGlowState(mat, { modulate: 0.4 })
		expect(uniforms.__uModulate.value).toBeCloseTo(0.4, 1e-5)
		setBulbGlowState(mat, {})
		expect(uniforms.__uModulate.value).toBeCloseTo(0.4, 1e-5)
	})

	it('masks the halo to the playfield footprint (cabinet side-wall light leak)', () => {
		// Regression: authored halo polygons routinely extend past the
		// cabinet walls (giant GI discs stick 6-9 units past; flasher sheets
		// reach ±26 out at halo height). Their overhanging fragments sit in
		// front of the side art from outside views and composite additively
		// over it as red wash plus edge-on streak lines. The shader must
		// reference the playfield area so those fragments can be masked out.
		const mat = createBulbGlowNodeMaterial({
			color: 0xff0000,
			color2: 0xffffff,
			centerX: 0,
			centerY: 0,
			falloff: 100,
			falloffPower: 2,
			intensity: 10,
		})
		const outputNode = materialize(mat.outputNode)
		expect(graphReferences(outputNode, uTransArea), 'halo must sample the playfield area').toBe(true)
		expect(graphReferences(outputNode, uBulbGlowFootprintClip), 'halo must gate on the footprint clip').toBe(true)
	})

	it('leaves the halo unmasked until the playfield area is configured', () => {
		// Safe default: library consumers that never call
		// setPrimitiveTransmissionArea render glow exactly as before.
		expect(uBulbGlowFootprintClip.value).toBe(0)
	})

	it('enables the halo footprint mask with the playfield area', () => {
		setPrimitiveTransmissionArea(952, 2247, 0.05)
		expect(uBulbGlowFootprintClip.value).toBe(1)
	})
})
