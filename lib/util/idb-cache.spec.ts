// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { describe, expect, it } from 'vitest'
import { idbGet, idbSet, vbsCacheKey } from './idb-cache.js'

describe('idb-cache without IndexedDB', () => {
	it('idbGet resolves undefined instead of rejecting', async () => {
		if (typeof indexedDB !== 'undefined') return
		await expect(idbGet('any-key')).resolves.toBeUndefined()
	})

	it('idbSet resolves instead of rejecting, like idbGet', async () => {
		if (typeof indexedDB !== 'undefined') return
		await expect(idbSet('any-key', 'any-value')).resolves.toBeUndefined()
	})

	it('vbs cache keys carry the current transpiler version, never a retired one', () => {
		// Stale transpiled JS running against a newer runtime produces
		// undebuggable crashes (wrong line numbers, old codegen). The prefix
		// must change whenever transpile output semantics change; retired
		// prefixes (vbs6 and older) must not be emitted anymore.
		const key = vbsCacheKey('Dim x')
		expect(key.startsWith('vbs7:')).toBe(true)
		expect(key.startsWith('vbs6:')).toBe(false)
		expect(vbsCacheKey('Dim x')).to.equal(key)
		expect(vbsCacheKey('Dim y')).not.to.equal(key)
	})
})
