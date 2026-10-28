// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import { describe, it } from 'vitest'
import { twdArgs } from './verify-browser.js'

describe('verify-browser twdArgs forwarding', () => {
	it('keeps --primary-only local and forwards the rest', () => {
		expect(twdArgs(['--primary-only', '--vpx=a.vpx'])).to.deep.equal(['--vpx=a.vpx'])
	})

	it('forwards addressing args in both = and space forms', () => {
		expect(twdArgs(['--vpx=a.vpx', '--rom', 'b.zip', '--url', 'u', '--gpu', 'amd'])).to.deep.equal([
			'--vpx=a.vpx',
			'--rom',
			'b.zip',
			'--url',
			'u',
			'--gpu',
			'amd',
		])
	})

	it('forwards unknown flags with their values verbatim', () => {
		expect(twdArgs(['--twd-timeout', '60', '--headed'])).to.deep.equal(['--twd-timeout', '60', '--headed'])
	})

	it('does not swallow the flag following a bare boolean flag', () => {
		expect(twdArgs(['--headed', '--vpx=a.vpx'])).to.deep.equal(['--headed', '--vpx=a.vpx'])
	})
})
