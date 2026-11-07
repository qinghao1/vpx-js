// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { expect } from 'chai'
import { withSourceParams } from './source-params.js'

const search = (href: string, sources: { vpx?: string; rom?: string }) => withSourceParams(href, sources).search

describe('withSourceParams', () => {
	it('mirrors both the table and its ROM', () => {
		expect(search('https://x.test/?mode=play', { vpx: 't.vpx', rom: 'r.zip' })).to.equal(
			'?mode=play&vpx=t.vpx&rom=r.zip',
		)
	})

	it('drops the ROM and the ?table alias when the viewer holds none', () => {
		expect(search('https://x.test/?table=old&rom=old.zip&mode=play', { vpx: 't.vpx' })).to.equal(
			'?mode=play&vpx=t.vpx',
		)
	})

	it('keeps a ROM that waits for its table', () => {
		expect(search('https://x.test/?vpx=t.vpx', { rom: 'r.zip' })).to.equal('?rom=r.zip')
	})
})
