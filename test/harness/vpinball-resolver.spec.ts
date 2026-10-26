// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import { getArg, hasFlag, parseVpxArgs } from './vpinball-resolver.js'

describe('vpinball-resolver arg parsing', () => {
	describe('getArg', () => {
		it('returns the default when the flag is absent', () => {
			expect(getArg([], 'vpx', null)).to.equal(null)
			expect(getArg(['--other=1'], 'vpx', 'fallback')).to.equal('fallback')
		})

		it('returns the --name=value payload', () => {
			expect(getArg(['--vpx=table-flipper'], 'vpx', null)).to.equal('table-flipper')
		})

		it('last occurrence wins on repeats', () => {
			expect(getArg(['--vpx=first.vpx', '--vpx=second.vpx'], 'vpx', null)).to.equal('second.vpx')
		})

		it('does not match other flag names sharing a prefix', () => {
			expect(getArg(['--vpxfoo=1'], 'vpx', null)).to.equal(null)
			expect(getArg(['--vpxfoo=1', '--vpx=ok.vpx'], 'vpx', null)).to.equal('ok.vpx')
		})

		it('ignores the space-separated form (documented: --name=value only)', () => {
			expect(getArg(['--vpx', 'table.vpx'], 'vpx', null)).to.equal(null)
		})

		it('keeps values containing = intact', () => {
			expect(getArg(['--url=http://x/?a=b'], 'url', null)).to.equal('http://x/?a=b')
		})
	})

	describe('parseVpxArgs', () => {
		it('extracts --vpx/--rom/--url and leaves the rest', () => {
			const parsed = parseVpxArgs(['--vpx=a.vpx', '--rom=b.zip', '--url=http://x', '--audit'])
			expect(parsed.vpx).to.equal('a.vpx')
			expect(parsed.rom).to.equal('b.zip')
			expect(parsed.url).to.equal('http://x')
			expect(parsed.rest).to.deep.equal(['--audit'])
		})

		it('last occurrence wins on repeats', () => {
			const parsed = parseVpxArgs(['--vpx=first.vpx', '--vpx=second.vpx'])
			expect(parsed.vpx).to.equal('second.vpx')
		})

		it('accepts the space-separated form', () => {
			const parsed = parseVpxArgs(['--vpx', 'a.vpx', '--rom', 'b.zip'])
			expect(parsed.vpx).to.equal('a.vpx')
			expect(parsed.rom).to.equal('b.zip')
			expect(parsed.rest).to.deep.equal([])
		})

		it('space form and equals form mix with last-wins', () => {
			const parsed = parseVpxArgs(['--vpx=first.vpx', '--vpx', 'second.vpx'])
			expect(parsed.vpx).to.equal('second.vpx')
		})

		it('treats a bare http(s) token as the url', () => {
			const parsed = parseVpxArgs(['https://localhost:3000/?vpx=a'])
			expect(parsed.url).to.equal('https://localhost:3000/?vpx=a')
			expect(parsed.rest).to.deep.equal([])
		})

		it('keeps non-flag tokens in rest', () => {
			const parsed = parseVpxArgs(['flipper', '--audit'])
			expect(parsed.vpx).to.equal(null)
			expect(parsed.rest).to.deep.equal(['flipper', '--audit'])
		})
	})

	describe('unified rule', () => {
		it('getArg and parseVpxArgs agree: last --vpx= wins', () => {
			const args = ['--vpx=first.vpx', '--vpx=second.vpx']
			expect(getArg(args, 'vpx', null)).to.equal('second.vpx')
			expect(parseVpxArgs(args).vpx).to.equal('second.vpx')
		})
	})

	describe('hasFlag', () => {
		it('matches exact flags only', () => {
			expect(hasFlag(['--audit'], 'audit')).to.equal(true)
			expect(hasFlag(['--audit=x'], 'audit')).to.equal(false)
			expect(hasFlag([], 'audit')).to.equal(false)
		})
	})
})
