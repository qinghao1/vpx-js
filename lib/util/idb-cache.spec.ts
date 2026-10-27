// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { describe, expect, it } from 'vitest'
import { idbGet, idbSet } from './idb-cache.js'

describe('idb-cache without IndexedDB', () => {
	it('idbGet resolves undefined instead of rejecting', async () => {
		if (typeof indexedDB !== 'undefined') return
		await expect(idbGet('any-key')).resolves.toBeUndefined()
	})

	it('idbSet resolves instead of rejecting, like idbGet', async () => {
		if (typeof indexedDB !== 'undefined') return
		await expect(idbSet('any-key', 'any-value')).resolves.toBeUndefined()
	})
})
