// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import type { TableDataPayload } from './transpiler-worker-core.js'
import { cacheKey, getVbsMemCache, MAX_VBS_MEM_CACHE_ENTRIES, setVbsMemCache } from './transpiler-worker-pool.js'

function payloadWith(apiProps: string[]): TableDataPayload {
	return {
		elementNames: ['MyFlipper'],
		elementEvents: { MyFlipper: ['Hit'] },
		elementApis: { MyFlipper: apiProps },
	}
}

describe('Transpiler worker cache keys', () => {
	it('should produce distinct keys for distinct tables', () => {
		const vbs = 'MyFlipper.Y = 123\n'
		const tdA = payloadWith(['X', 'Y'])
		const tdB = payloadWith(['X', 'Y', 'Z'])
		expect(cacheKey(vbs, 'play', 'global', tdA)).to.not.equal(cacheKey(vbs, 'play', 'global', tdB))
	})

	it('should produce distinct keys when table data is absent vs present', () => {
		const vbs = 'x = 1\n'
		const td = payloadWith(['X'])
		expect(cacheKey(vbs, 'play', 'global', td)).to.not.equal(cacheKey(vbs, 'play', 'global', null))
		expect(cacheKey(vbs, 'play', 'global', td)).to.not.equal(cacheKey(vbs, 'play', 'global', undefined))
	})

	it('should be stable for identical inputs', () => {
		const vbs = 'x = 1\n'
		expect(cacheKey(vbs, 'play', 'global', payloadWith(['X']))).to.equal(
			cacheKey(vbs, 'play', 'global', payloadWith(['X'])),
		)
	})

	it('should bound the memory cache with oldest-first eviction', () => {
		for (let i = 0; i < MAX_VBS_MEM_CACHE_ENTRIES + 5; i++) {
			setVbsMemCache(`__bound-probe-${i}`, `js-${i}`)
		}
		expect(getVbsMemCache('__bound-probe-0')).to.equal(undefined)
		expect(getVbsMemCache(`__bound-probe-${MAX_VBS_MEM_CACHE_ENTRIES + 4}`)).to.equal(
			`js-${MAX_VBS_MEM_CACHE_ENTRIES + 4}`,
		)
		// Refreshing an existing key must not evict.
		setVbsMemCache(`__bound-probe-${MAX_VBS_MEM_CACHE_ENTRIES + 4}`, 'js-refreshed')
		expect(getVbsMemCache(`__bound-probe-${MAX_VBS_MEM_CACHE_ENTRIES + 4}`)).to.equal('js-refreshed')
		expect(getVbsMemCache('__bound-probe-5')).to.equal('js-5')
	})
})
