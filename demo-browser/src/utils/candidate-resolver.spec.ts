// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { expect } from 'chai'
import { resolveVpxCandidates } from './candidate-resolver.js'

describe('resolveVpxCandidates', () => {
	it('returns no candidates for empty input', () => {
		expect(resolveVpxCandidates('')).to.deep.equal([])
		expect(resolveVpxCandidates('   ')).to.deep.equal([])
	})

	it('keeps bare names page-relative and appends the extension', () => {
		expect(resolveVpxCandidates('table-empty')).to.deep.equal(['table-empty.vpx'])
	})

	it('keeps subpaths page-relative with a basename fallback', () => {
		expect(resolveVpxCandidates('test/fixtures/table-empty.vpx')).to.deep.equal([
			'test/fixtures/table-empty.vpx',
			'table-empty.vpx',
		])
	})

	it('leaves explicitly server-absolute names alone', () => {
		expect(resolveVpxCandidates('/abs/path.vpx')).to.deep.equal(['/abs/path.vpx'])
	})

	it('passes remote and dev-server URLs through untouched', () => {
		expect(resolveVpxCandidates('https://example.com/a.vpx')).to.deep.equal(['https://example.com/a.vpx'])
		expect(resolveVpxCandidates('HTTP://example.com/a.vpx')).to.deep.equal(['HTTP://example.com/a.vpx'])
		expect(resolveVpxCandidates('/@fs/home/u/table.vpx')).to.deep.equal(['/@fs/home/u/table.vpx'])
	})
})
