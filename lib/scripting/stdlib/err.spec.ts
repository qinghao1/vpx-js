// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { TableBuilder } from '../../../test/table-builder.js'
import { Player } from '../../game/player.js'
import { Table } from '../../vpt/table/table.js'
import { Transpiler } from '../transpiler.js'
import { Err } from './err.js'

chai.use((sinonChai as any).default ?? sinonChai)

describe('The VBScript error object', () => {
	it('should persist all properties when raising', () => {
		const err = new Err()
		err.OnErrorResumeNext()
		err.Raise(1, 'source', 'descr', 'helpfile', 'helpcontext')

		expect(err.Number).to.equal(1)
		expect(err.Source).to.equal('source')
		expect(err.Description).to.equal('descr')
		expect(err.HelpFile).to.equal('helpfile')
		expect(err.HelpContext).to.equal('helpcontext')
	})

	it('should clear all properties when clearing', () => {
		const err = new Err()
		err.OnErrorResumeNext()
		err.Raise(1, 'source', 'descr', 'helpfile', 'helpcontext')
		err.Clear()

		expect(err.Number).to.equal(0)
		expect(err.Source).to.equal('')
		expect(err.Description).to.equal('')
		expect(err.HelpFile).to.equal('')
		expect(err.HelpContext).to.equal('')
	})

	it('should throw an exception', () => {
		const err = new Err()
		expect(() => err.Raise(1, undefined, 'duh')).to.throw(`Error 1: duh`)
	})
})
