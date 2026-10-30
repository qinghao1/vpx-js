// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import { settleWorkerEntry, type WorkerPendingEntry, withWorkerTimeout } from './worker-pending.js'

describe('withWorkerTimeout', () => {
	it('rejects and drops the entry after the timeout', async () => {
		const pending = new Map<number, WorkerPendingEntry<string>>()
		let rejected: unknown
		pending.set(1, { resolve: () => {}, reject: e => (rejected = e) })
		withWorkerTimeout(pending, 1, 5, 'boom')
		await new Promise(resolve => setTimeout(resolve, 20))
		expect(pending.has(1)).to.equal(false)
		expect(String(rejected)).to.contain('boom')
	})

	it('does nothing once settled', async () => {
		const pending = new Map<number, WorkerPendingEntry<string>>()
		pending.set(2, { resolve: () => {}, reject: () => {} })
		const entry = settleWorkerEntry(pending, 2)
		expect(entry).to.not.equal(undefined)
		expect(pending.has(2)).to.equal(false)
		expect(settleWorkerEntry(pending, 2)).to.equal(undefined)
		withWorkerTimeout(pending, 2, 5, 'boom')
		await new Promise(resolve => setTimeout(resolve, 20))
	})
})
