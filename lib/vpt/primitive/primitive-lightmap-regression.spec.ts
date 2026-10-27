import { describe, expect, it } from 'vitest'
import { TableBuilder } from '../../../test/table-builder.js'
import { TestRenderApi } from '../../../test/test-render-api.js'
import type { IRenderApi } from '../../render/irender-api.js'
import type { Primitive } from './primitive.js'
import { PRIMITIVE_ADDITIVE_KIND } from './primitive-material-protocol.js'

function lightmapFixture(currentIntensity: number, baseIntensity: number, scale: number) {
	const table = new TableBuilder()
		.addMaterial('insertOn', { baseColor: 0xffffff })
		.addPrimitive('LmPrim', {
			szMaterial: 'insertOn',
			szLightmap: 'L1',
			addBlend: true,
			alpha: 100,
			color: 0xffffff,
			staticRendering: false,
		})
		.build() as unknown as Record<string, any>
	table.lights = {
		L1: {
			data: { intensity: baseIntensity, intensityScale: scale },
			getState: () => ({ intensity: currentIntensity }),
		},
	}
	const primitive = (table.primitives as unknown as Record<string, Primitive>).LmPrim!
	expect(primitive, 'LmPrim must exist').toBeDefined()
	const updater = primitive.getUpdater()
	const material = {
		userData: {
			__primitiveKind: PRIMITIVE_ADDITIVE_KIND,
			__uTint: { value: { set: () => {}, getHex: () => 0xffffff } },
			__uIntensity: { value: 0 },
			__uFlat: {
				value: {
					set: () => ({ multiplyScalar: () => {} }),
					multiplyScalar: () => {},
				},
			},
		},
	}
	const node = { children: [{ material }] }
	const renderApi = new TestRenderApi() as unknown as IRenderApi<any, any, any>
	updater.applyState(node, {} as any, renderApi, table as any)
	return (material.userData.__uIntensity as { value: number }).value
}

describe('The VPinball primitive lightmap modulation', () => {
	it('should scale alpha by the lamp ratio when fully on (upstream primitive.cpp:932-940)', () => {
		// current = base x scale x state = 10 x 1 x 1 -> factor 1 -> 100 x 0.01.
		expect(lightmapFixture(10, 10, 1)).toBeCloseTo(1, 1e-5)
	})

	it('should scale alpha by the lamp ratio mid-fade, not by the raw level', () => {
		// Early fade: current 0.5 against base 10 -> factor 0.05 -> 100 x 0.05 x 0.01.
		expect(lightmapFixture(0.5, 10, 1)).toBeCloseTo(0.05, 1e-5)
	})

	it('should not blow up 100x on a normalized lamp level against a hot lamp', () => {
		// current 1 against base 100 -> factor 0.01, never the raw 1.0.
		expect(lightmapFixture(1, 100, 1)).toBeCloseTo(0.01, 1e-5)
	})

	it('should respect the intensity scale in the denominator', () => {
		// current 10 against base 10 x scale 2 -> factor 0.5.
		expect(lightmapFixture(10, 10, 2)).toBeCloseTo(0.5, 1e-5)
	})

	it('should kill the alpha when the lamp base and scale are both zero', () => {
		// Upstream: denom == 0 -> alpha = 0.
		expect(lightmapFixture(5, 0, 0)).toBeCloseTo(0, 1e-5)
	})
})
