// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect } from 'chai'
import * as browserScripts from './vbs-scripts.browser.js'
import { getTextFile, hasTextFile } from './vbs-scripts.node.js'

// Upstream checkout; present only with the vpinball submodule.
const HAS_UPSTREAM = existsSync(fileURLToPath(new URL('../../external/vpinball/src/scripts', import.meta.url)))

describe('bundled VBS system scripts', () => {
	it('bundles sys80.vbs containing LoadCore', () => {
		expect(hasTextFile('sys80.vbs'), 'has sys80.vbs').to.equal(true)
		expect(getTextFile('sys80.vbs'), 'loads sys80.vbs').to.contain('LoadCore')
	})

	it.skipIf(!HAS_UPSTREAM)('vendors every upstream system script', () => {
		const res = new Set(
			readdirSync(fileURLToPath(new URL('../../res/scripts', import.meta.url))).map(f => f.toLowerCase()),
		)
		const missing = readdirSync(fileURLToPath(new URL('../../external/vpinball/src/scripts', import.meta.url)))
			.filter(f => f.toLowerCase().endsWith('.vbs'))
			.filter(f => !res.has(f.toLowerCase()))
		expect(missing, 'upstream scripts missing from res/scripts').to.deep.equal([])
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

	it('resolves every committed script in both node and browser implementations', () => {
		const dir = fileURLToPath(new URL('../../res/scripts', import.meta.url))
		const names = readdirSync(dir).filter(f => f.toLowerCase().endsWith('.vbs'))
		for (const name of names) {
			const text = getTextFile(name)
			expect(text, `node loads ${name}`).to.not.be.empty
			expect(browserScripts.getTextFile(name), `browser loads ${name}`).to.equal(text)
		}
	})

	it('resolves SEGA.VBS with its core.vbs dependency', () => {
		expect(getTextFile('SEGA.VBS'), 'SEGA.VBS pulls in core.vbs').to.contain('core.vbs')
	})

	it('keeps the vendored scripts in sync with upstream', () => {
		const core = getTextFile('core.vbs')
		expect(core, 'tracks upstream 3.62').to.contain('VPinMAMEDriverVer = 3.62')
		expect(core, 'has Capcom flipper-strength support').to.contain('SolOnAboveZero')
		expect(core, 'held DMD-frame check stays out (IsArray(Uint8Array) is false)').to.not.contain(
			'Function vpmHasDmdFrame',
		)
		expect(core, 'DMD keeps the IsEmpty check').to.contain('If Not IsEmpty(DMDp) Then')
		expect(getTextFile('sam.vbs'), 'keeps the vpx-js RomMode adaptation').to.contain('RomMode=False')
		expect(core, 'flippers work without ROM control like sam.vbs').to.contain('FlippersEnabled=1')
	})
})
