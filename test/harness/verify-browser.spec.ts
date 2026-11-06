// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import { describe, it } from 'vitest'
import { browserStatusToExitCode, exitCodeToStatus } from './verify-browser.js'

describe('verify-browser status mapping', () => {
	it('maps status to exit codes', () => {
		expect(browserStatusToExitCode('pass')).to.equal(0)
		expect(browserStatusToExitCode('skip')).to.equal(77)
		expect(browserStatusToExitCode('fail')).to.equal(1)
	})

	it('maps exit codes to status', () => {
		expect(exitCodeToStatus(0)).to.equal('pass')
		expect(exitCodeToStatus(77)).to.equal('skip')
		expect(exitCodeToStatus(1)).to.equal('fail')
		expect(exitCodeToStatus(null)).to.equal('fail')
	})
})
