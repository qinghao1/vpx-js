// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import type { TableDataPayload } from './transpiler-worker-core.js'
import {
	cacheKey,
	clearAstMemCache,
	getAstMemCache,
	getTableDataForWorker,
	getVbsMemCache,
	MAX_AST_MEM_CACHE_ENTRIES,
	MAX_VBS_MEM_CACHE_ENTRIES,
	setAstMemCache,
	setVbsMemCache,
	tdHash,
} from './transpiler-worker-pool.js'

function payloadWith(apiProps: string[]): TableDataPayload {
	return {
		elementNames: ['MyFlipper'],
		elementEvents: { MyFlipper: ['Hit'] },
		elementApis: { MyFlipper: apiProps },
	}
}

function mockTable(names: string[]) {
	const elements: Record<string, unknown> = {}
	for (const name of names) elements[name] = { getEventNames: () => ['Hit'] as string[] }
	const table = { getElements: () => elements, getElementApis: () => ({}) }
	return { table, elements }
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

	it('should memoize the table hash per payload object', () => {
		const td = payloadWith(['X', 'Y'])
		expect(tdHash(payloadWith(['X', 'Y']))).to.equal(tdHash(td))
	})

	it('should reuse the table-data payload for the same table object', () => {
		const { table } = mockTable(['Flipper'])
		const first = getTableDataForWorker(table)
		expect(first?.elementNames).to.eql(['Flipper'])
		expect(getTableDataForWorker(table)).to.equal(first)
	})

	it('should rebuild the table-data payload when elements change', () => {
		const { table, elements } = mockTable(['Flipper'])
		const first = getTableDataForWorker(table)
		elements.Bumper = { getEventNames: () => [] as string[] }
		const second = getTableDataForWorker(table)
		expect(second).to.not.equal(first)
		expect(second?.elementNames).to.eql(['Flipper', 'Bumper'])
		// Same table, different player: the GlobalApi sample may differ, so no shared payload.
		expect(getTableDataForWorker(table, { id: 1 })).to.not.equal(getTableDataForWorker(table, { id: 2 }))
	})

	it('should round-trip cached ESTrees as fresh clones', () => {
		clearAstMemCache()
		setAstMemCache('__ast-probe', { type: 'Program', body: [{ type: 'EmptyStatement' }] } as any)
		const hit = getAstMemCache('__ast-probe')
		expect(hit).to.eql({ type: 'Program', body: [{ type: 'EmptyStatement' }] })
		expect(hit).to.not.equal(getAstMemCache('__ast-probe'))
		// Mutating a hit must not corrupt the cached tree (the pipeline mutates in place).
		;(hit as any).body.push({ type: 'EmptyStatement' })
		expect((getAstMemCache('__ast-probe') as any).body).to.have.length(1)
	})

	it('should bound the ESTree cache with oldest-first eviction', () => {
		clearAstMemCache()
		for (let i = 0; i < MAX_AST_MEM_CACHE_ENTRIES + 2; i++) {
			setAstMemCache(`__ast-bound-${i}`, { type: 'Program', body: [] } as any)
		}
		expect(getAstMemCache('__ast-bound-0')).to.equal(undefined)
		expect(getAstMemCache(`__ast-bound-${MAX_AST_MEM_CACHE_ENTRIES + 1}`)).to.not.equal(undefined)
		clearAstMemCache()
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
