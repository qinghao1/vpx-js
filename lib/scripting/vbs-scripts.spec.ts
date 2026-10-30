// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect } from 'chai'
import { getTextFile, hasTextFile } from './vbs-scripts.node.js'

// Upstream checkout; present only with the vpinball submodule.
const HAS_UPSTREAM = existsSync(fileURLToPath(new URL('../../external/vpinball/src/scripts', import.meta.url)))

describe('bundled VBS system scripts', () => {
	it('bundles sys80.vbs containing LoadCore', () => {
		expect(hasTextFile('sys80.vbs'), 'has sys80.vbs').to.equal(true)
		expect(getTextFile('sys80.vbs'), 'loads sys80.vbs').to.contain('LoadCore')
	})

	it.skipIf(!HAS_UPSTREAM)('falls back to the upstream checkout for non-committed scripts', () => {
		for (const name of ['bally.vbs', 'stern.vbs', 'gts3.vbs']) {
			expect(hasTextFile(name), `has ${name}`).to.equal(true)
			expect(getTextFile(name), `loads ${name}`).to.not.be.empty
		}
	})

	it('resolves names case-insensitively', () => {
		expect(hasTextFile('SYS80.VBS'), 'upper-case lookup').to.equal(true)
		expect(hasTextFile('VPMKeys.vbs'), 'upstream casing').to.equal(true)
		expect(hasTextFile('vpmkeys.vbs'), 'lower-case lookup').to.equal(true)
		expect(hasTextFile('no-such-file.vbs'), 'missing stays missing').to.equal(false)
	})

	it('raises VB error 53 for a missing script', () => {
		expect(() => getTextFile('no-such-file.vbs')).to.throw('53')
	})
})
