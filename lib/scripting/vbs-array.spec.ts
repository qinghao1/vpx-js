// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { ERR, VbsError } from './stdlib/err.js'
import { isIntKey, isVbsArray, VbsArray } from './vbs-array.js'
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
		const arr = new VbsArray<number | string>([1, 'two', 3]) as any
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

	it('should read index 0 for an Empty subscript', () => {
		const arr = new VbsArray<number | string>([1, 'two', 3]) as any
		ERR.Clear()
		expect(arr[undefined as any]).to.equal(1)
		expect(ERR.Number).to.equal(0)
	})

	it('should resolve numeric, string, and non-canonical index reads identically', () => {
		const arr = new VbsArray<number | string>([1, 'two', 3]) as any
		ERR.Clear()
		expect(arr[1]).to.equal('two')
		expect(arr['1']).to.equal('two')
		expect(arr['01']).to.equal('two')
		expect(arr.length).to.equal(3)
		expect(arr[-1] as any).to.be.an.instanceof(VbsUndefined)
		expect(ERR.Number).to.equal(0)
	})

	it('should record error 94 for a Null subscript under On Error Resume Next', () => {
		const arr = new VbsArray<number | string>([1, 'two', 3]) as any
		ERR.Clear()
		expect(arr[null as any]).to.be.an.instanceof(VbsUndefined)
		expect(ERR.Number).to.equal(94)
		ERR.Clear()
		arr[null as any] = 10
		expect(ERR.Number).to.equal(94)
		expect(arr[0]).to.equal(1)
	})

	it('should extend on a past-the-end write but record error 9 for a negative one', () => {
		// Strict VBScript would raise 9 for both, but our by-value args
		// lose a callee's plain-ReDim growth (see the FlipperPolarity
		// transpiler test), so only the caller's write can grow the array.
		// Negatives are error 9 in VBScript unconditionally.
		const arr = new VbsArray<number | string>([1, 'two', 3]) as any
		ERR.Clear()
		arr[3] = 10
		expect(ERR.Number).to.equal(0)
		expect(arr.length).to.equal(4)
		expect(arr[3]).to.equal(10)
		ERR.Clear()
		arr[-1] = 10
		expect(ERR.Number).to.equal(9)
	})

	it('should throw error 9 for a negative write without On Error Resume Next', () => {
		const arr = new VbsArray<number | string>([1, 'two', 3]) as any
		ERR.OnErrorGoto0()
		try {
			expect(() => {
				arr[-1] = 10
			}).to.throw(VbsError)
		} finally {
			ERR.OnErrorResumeNext()
		}
		expect(arr[2]).to.equal(3)
	})

	it('should throw error 94 for a Null subscript without On Error Resume Next', () => {
		const arr = new VbsArray<number | string>([1, 'two', 3]) as any
		ERR.OnErrorGoto0()
		try {
			expect(() => arr[null as any]).to.throw(VbsError)
			try {
				arr[null as any] = 10
				expect.fail('should have raised error 94')
			} catch (e) {
				expect(e).to.be.an.instanceof(VbsError)
				expect((e as VbsError).code).to.equal(94)
			}
		} finally {
			ERR.OnErrorResumeNext()
		}
	})

	it('should accept exactly the integer subscripts of /^-?\\d+$/', () => {
		const accepted = ['0', '7', '42', '007', '-0', '-3', '1234567890']
		const rejected = [
			'',
			'-',
			' ',
			' 12',
			'+12',
			'1e3',
			'0x10',
			'12.5',
			'1_2',
			'abc',
			'Item',
			'length',
			'NaN',
			'Infinity',
		]
		for (const key of accepted) expect(isIntKey(key), key).to.equal(true)
		for (const key of rejected) expect(isIntKey(key), key).to.equal(false)
		for (const key of [...accepted, ...rejected]) {
			expect(isIntKey(key), key).to.equal(/^-?\d+$/.test(key))
		}
	})

	it('should brand only its own proxies', () => {
		const arr = new VbsArray([1, 2, 3])
		expect(isVbsArray(arr)).to.equal(true)
		expect(isVbsArray([1, 2, 3])).to.equal(false)
		expect(isVbsArray({ 0: 1, length: 1 })).to.equal(false)
		expect(isVbsArray(null)).to.equal(false)
		expect(isVbsArray(7)).to.equal(false)
	})
})
