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

	it('defaults a missing tone mapper to AgX like upstream', () => {
		expect(resolveToneMapping(undefined)).to.equal(AgXToneMapping)
	})

	it('falls back to AgX for out-of-range ids', () => {
		expect(resolveToneMapping(99)).to.equal(AgXToneMapping)
		expect(resolveToneMapping(-1)).to.equal(AgXToneMapping)
	})

	it('falls back to AgX for legacy and internal ids like upstream GetValidToneMapper', () => {
		// Upstream maps anything outside 0-3 (including the internal
		// TM_WCG_SPLINE=256) to AgX; there is no Linear entry.
		expect(resolveToneMapping(5)).to.equal(AgXToneMapping)
		expect(resolveToneMapping(256)).to.equal(AgXToneMapping)
	})

	it('clamps exposure to the native 0..2 range by default', () => {
		expect(clampExposure(9)).to.equal(2)
		expect(clampExposure(1)).to.equal(1)
	})

	it('applies the AgX default when table data is missing', () => {
		const renderer: { toneMapping?: number; toneMappingExposure?: number } = {}
		applyRendererToneMapping(renderer, undefined, false)
		expect(renderer.toneMapping).to.equal(AgXToneMapping)
		expect(renderer.toneMappingExposure).to.equal(1)
	})
})
