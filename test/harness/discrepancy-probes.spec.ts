// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import { Stdlib } from '../../lib/scripting/stdlib/index.js'
import { getLibTsFiles } from './capture-discrepancies.js'

describe('discrepancy runtime probes', () => {
	it('Stdlib.RGB matches one of the two known mappings (native BBGGRR or legacy RRGGBB)', () => {
		const got = new Stdlib().RGB(10, 20, 30)
		const legacy = (10 << 16) | (20 << 8) | 30
		const nativeColorref = (30 << 16) | (20 << 8) | 10
		expect(got === legacy || got === nativeColorref).to.equal(true)
	})
})

describe('getLibTsFiles cache', () => {
	it('returns a stable cached list of lib sources', () => {
		const first = getLibTsFiles()
		expect(first.length).to.be.greaterThan(0)
		expect(first.every(f => f.endsWith('.ts') && !f.endsWith('.spec.ts'))).to.equal(true)
		expect(getLibTsFiles()).to.equal(first)
	})
})
