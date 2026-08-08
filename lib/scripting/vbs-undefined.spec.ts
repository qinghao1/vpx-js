// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { VbsUndefined } from './vbs-undefined.js'

chai.use((sinonChai as any).default ?? sinonChai)
describe('The VBScript undefined handler', () => {
	it('should be comparable', () => {
		const undef = new VbsUndefined() as unknown
		expect(() => undef == 1).not.to.throw()
	})

	it('should return "undefined" as string', () => {
		const undef = new VbsUndefined() as unknown
		expect(String(undef)).to.equal('undefined')
	})
})
