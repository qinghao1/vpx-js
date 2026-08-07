// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { ERR } from './stdlib/err.js'
import { VbsArray } from './vbs-array.js'
import { VbsUndefined } from './vbs-undefined.js'

chai.use((sinonChai as any).default ?? sinonChai)
describe('The VBScript array', () => {
	before(() => {
		ERR.OnErrorResumeNext()
	})

	after(() => {
		ERR.OnErrorGoto0()
	})

	it('should initialize correctly', () => {
		const arr = new VbsArray<number | string>([1, 'two', 3])
		expect(arr[0]).to.equal(1)
		expect(arr[1]).to.equal('two')
		expect(arr[2]).to.equal(3)
	})

	it('should loop correctly', () => {
		const arr = new VbsArray<number | string>() as any
		arr[0] = 1
		arr[1] = 'two'
		arr[2] = 3
		let i = 0
		for (const val of arr) {
			switch (i) {
				case 0:
					expect(val).to.equal(1)
					break
				case 1:
					expect(val).to.equal('two')
					break
				case 2:
					expect(val).to.equal(3)
					break
				default:
					throw new Error('Out of range!')
			}
			i++
		}
	})

	it('should count correctly', () => {
		const arr = new VbsArray<number | string>([1, 'two', 3]) as any
		expect(arr.length).to.equal(3)
	})

	it('should return a fake object for unknown indices', () => {
		const arr = new VbsArray<number | string>([1, 'two', 3])
		const none = arr[99] as any
		expect(none).to.be.an.instanceof(VbsUndefined)
	})

	it('should register an error when getting a value from an undefined array value', () => {
		const arr = new VbsArray<number | string>([1, 'two', 3])
		const none = arr[99] as any
		expect(() => none.foo).not.to.throw()
		expect(() => none.foo.bar).not.to.throw()
		expect(ERR.Number).to.equal(9)
	})

	it('should register an error when setting a value from an undefined array value', () => {
		const arr = new VbsArray<number | string>([1, 'two', 3])
		const none = arr[99] as any
		expect(() => (none.foo = 10)).not.to.throw()
		expect(() => (none.foo.bar = 10)).not.to.throw()
		expect(ERR.Number).to.equal(9)
	})
})
