// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import { storage } from './storage.js'

describe('The key-value storage', () => {
	it('should read missing keys as empty string on every backend', () => {
		expect(storage.getItem(`vpx-missing-${Date.now()}`)).to.equal('')
	})

	it('should round-trip stored values', () => {
		const key = `vpx-roundtrip-${Date.now()}`
		storage.setItem(key, { level: 3 })
		expect(storage.getItem(key)).to.deep.equal({ level: 3 })
	})
})
