// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { expect } from 'chai'
import { createLog } from './page-log.js'

describe('createLog', () => {
	beforeEach(() => {
		vi.spyOn(console, 'log').mockImplementation(() => {})
		vi.spyOn(console, 'warn').mockImplementation(() => {})
	})
	afterEach(() => vi.restoreAllMocks())

	it('keeps the newest entries, one per line, and mirrors them to the console', () => {
		const log = createLog(2)
		log('first')
		log('second', 'warn')
		log('third')
		const lines = log.text().split('\n')
		expect(lines).to.have.length(2)
		expect(lines[0]).to.match(/\] second$/)
		expect(lines[1]).to.match(/\] third$/)
		expect(console.warn).toHaveBeenCalledWith('[vpx]', 'second')
	})
})
