import { expect } from 'chai'
import { ACESFilmicToneMapping, AgXToneMapping, NeutralToneMapping, ReinhardToneMapping } from 'three'
import { applyRendererToneMapping, clampExposure, resolveToneMapping } from './tone-mapping.js'

describe('tone mapping', () => {
	it('resolves the native ToneMapper ids to three.js mappers', () => {
		expect(resolveToneMapping(0)).to.equal(ReinhardToneMapping)
		expect(resolveToneMapping(1)).to.equal(AgXToneMapping)
		expect(resolveToneMapping(2)).to.equal(ACESFilmicToneMapping)
		expect(resolveToneMapping(3)).to.equal(NeutralToneMapping)
		expect(resolveToneMapping(4)).to.equal(AgXToneMapping)
	})

	it('falls back to AgX for missing, out-of-range, legacy, and internal ids', () => {
		// Upstream GetValidToneMapper maps anything outside 0-3 (including
		// the internal TM_WCG_SPLINE=256) to AgX; there is no Linear entry.
		for (const id of [undefined, 99, -1, 5, 256] as const) {
			expect(resolveToneMapping(id), `id ${String(id)}`).to.equal(AgXToneMapping)
		}
	})

	it('clamps exposure to the native 0..2 range by default', () => {
		expect(clampExposure(9)).to.equal(2)
		expect(clampExposure(1)).to.equal(1)
	})

	it('caps low-quality exposure at 1.5 through the quality flag (single owner)', () => {
		expect(clampExposure(9, true)).to.equal(1.5)
		expect(clampExposure(9, false)).to.equal(2)
		expect(clampExposure(1.2, true)).to.equal(1.2)
	})

	it('caps low-quality exposure at 1.5 when applying table data', () => {
		const renderer: { toneMapping?: number; toneMappingExposure?: number } = {}
		applyRendererToneMapping(renderer, { exposure: 9 }, true)
		expect(renderer.toneMappingExposure).to.equal(1.5)
	})

	it('applies the AgX default when table data is missing', () => {
		const renderer: { toneMapping?: number; toneMappingExposure?: number } = {}
		applyRendererToneMapping(renderer, undefined, false)
		expect(renderer.toneMapping).to.equal(AgXToneMapping)
		expect(renderer.toneMappingExposure).to.equal(1)
	})
})
