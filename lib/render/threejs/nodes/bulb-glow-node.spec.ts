import { AdditiveBlending, DataTexture } from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import {
	createBulbGlowNodeMaterial,
	createMergedBulbGlowMaterial,
	isBulbGlowMaterial,
	setBulbGlowState,
} from './bulb-glow-node.js'
import {
	backdropStubTexture,
	setAdditiveBackdrop,
	setPrimitiveTransmissionArea,
	uBulbGlowFootprintClip,
	uPlayfieldSurfaceY,
	uTransArea,
} from './primitive-bdl-node.js'
import { collectNodes, graphReferences, materialize } from './tsl-test-harness.js'

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
		expect(mat.colorNode).toBeDefined()
		// Positive additive light: the native negatively-encoded
		// REVSUBTRACT form draws nothing on the WebGPU backend, so the
		// dst-modulation nuance is approximated by the additive lift.
		// Runs in the pipeline scene pass's transparent phase, so no
		// extra pass is needed.
		expect(mat.blending, 'bulb halo composites additively').toBe(AdditiveBlending)
	})

	it('should store the clamped modulateVsAdd', () => {
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
		const colorNode = materialize(mat.colorNode)
		expect(graphReferences(colorNode, uTransArea), 'halo must sample the playfield area').toBe(true)
		expect(graphReferences(colorNode, uBulbGlowFootprintClip), 'halo must gate on the footprint clip').toBe(true)
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

	it('emits positive additive light for both factories', () => {
		// Regression: the negatively-encoded REVSUBTRACT output drew nothing
		// on the WebGPU backend (program runs, fragments stay dst), so halos
		// must composite additively with a positive rgb and alpha 1.
		const perQuad = createBulbGlowNodeMaterial({
			color: 0xff6020,
			color2: 0xffffff,
			centerX: 0,
			centerY: 0,
			falloff: 100,
			falloffPower: 2,
			intensity: 10,
		})
		const merged = createMergedBulbGlowMaterial()
		for (const mat of [perQuad, merged]) {
			expect(mat.blending).toBe(AdditiveBlending)
			const dag = collectNodes(materialize(mat.colorNode))
			// -1 = removed negative-encoding factor of the REVSUBTRACT form.
			expect(
				dag.some(n => n.value === -1),
				'halo must not negatively encode its output',
			).toBe(false)
		}
	})

	it('carries a backdrop tap holding the reference constant pre-stream', () => {
		// The tap samples the playfield albedo as the native dst once the
		// drain binds it; until then it must behave exactly like the old
		// constant weight so pre-stream frames are unchanged.
		const perQuad = createBulbGlowNodeMaterial({
			color: 0xffffff,
			color2: 0xffffff,
			centerX: 0,
			centerY: 0,
			falloff: 100,
			falloffPower: 2,
			intensity: 10,
		})
		for (const mat of [perQuad, createMergedBulbGlowMaterial()]) {
			const ud = mat.userData as Record<string, unknown>
			expect(ud.__backdropArm).toBe(true)
			const nodes = ud.__backdropNodes as { value: unknown }[]
			expect(nodes).toHaveLength(1)
			expect(nodes[0].value).toBe(backdropStubTexture())
			expect(ud.__backdropMap ?? null).toBe(null)
			expect(graphReferences(materialize(mat.colorNode), nodes[0])).toBe(true)
		}
	})

	it('rebinds the backdrop tap to streamed playfield art in place', () => {
		const mat = createMergedBulbGlowMaterial()
		const ud = mat.userData as Record<string, unknown>
		const nodes = ud.__backdropNodes as { value: unknown }[]
		const art = new DataTexture(new Uint8Array([200, 100, 50, 255]), 1, 1)
		expect(setAdditiveBackdrop(mat, art, 'pf')).toBe(true)
		expect(nodes[0].value).toBe(art)
		expect(ud.__backdropMap).toBe(art)
		expect(ud.__backdropName).toBe('pf')
	})

	it('refuses the backdrop bind on materials without the tap', () => {
		expect(setAdditiveBackdrop({}, backdropStubTexture())).toBe(false)
	})
})
