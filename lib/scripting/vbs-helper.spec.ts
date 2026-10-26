// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { TableBuilder } from '../../test/table-builder.js'
import { Player } from '../game/player.js'
import { ERR, VbsError } from './stdlib/err.js'
import { Stdlib } from './stdlib/index.js'
import { Transpiler } from './transpiler.js'
import { VBSHelper } from './vbs-helper.js'
import { VbsUndefined } from './vbs-undefined.js'

chai.use((sinonChai as any).default ?? sinonChai)

describe('The scripting VBS Helper', () => {
	const table = new TableBuilder().build()
	const vbsHelper = new VBSHelper(new Transpiler(table, new Player(table)))

	afterEach(() => {
		ERR.Clear()
		ERR.OnErrorGoto0()
	})

	it('should create a one-dimension array', () => {
		const js = vbsHelper.dim([100])
		expect(js.length).to.equal(101)
	})

	it('should reduce a one-dimension array', () => {
		let js = vbsHelper.dim([100])
		js = vbsHelper.redim(js, [50])
		expect(js.length).to.equal(51)
	})

	it('should reduce and preserve a one-dimension array', () => {
		let js = vbsHelper.dim([100])
		js[50] = 'Test'
		js[51] = 'Test'
		js = vbsHelper.redim(js, [50], true)
		expect(js[50]).to.equal(`Test`)
		expect(js[51]).to.be.an.instanceof(VbsUndefined)
		expect(js.length).to.equal(51)
	})

	it('should expand a one-dimension array', () => {
		let js = vbsHelper.dim([100])
		js[100] = 'Test'
		js = vbsHelper.redim(js, [150])
		expect(js[100]).to.be.an.instanceof(VbsUndefined)
		expect(js.length).to.equal(151)
	})

	it('should expand and preserve a one-dimension array', () => {
		let js = vbsHelper.dim([100])
		js[100] = 'Test'
		js = vbsHelper.redim(js, [150], true)
		expect(js[100]).to.equal(`Test`)
		expect(js.length).to.equal(151)
	})

	it('should create a three-dimension array', () => {
		const js = vbsHelper.dim([4, 3, 2])
		expect(js.length).to.equal(5)
		expect(js[0].length).to.equal(4)
		expect(js[0][0].length).to.equal(3)
	})

	it('should test upper bounds of a three-dimension array', () => {
		const js = vbsHelper.dim([4, 3, 2])
		expect(() => (js[4][4][2] = 'Test')).to.throw()
	})

	it('should test invalid dimension change of a three-dimension array', () => {
		const js = vbsHelper.dim([4, 3, 2])
		try {
			vbsHelper.redim(js, [4, 4, 2])
			expect.fail('should have raised error 9')
		} catch (e) {
			expect(e).to.be.an.instanceof(VbsError)
			expect((e as VbsError).code).to.equal(9)
		}
	})

	it('should record error 9 and keep the array unchanged when redim fails under On Error Resume Next', () => {
		ERR.OnErrorResumeNext()
		const js = vbsHelper.dim([4, 3, 2])
		const result = vbsHelper.redim(js, [4, 4, 2])
		expect(result).to.equal(js)
		expect(result.length).to.equal(5)
		expect(ERR.Number).to.equal(9)
	})

	it('should coerce numeric string bounds', () => {
		expect(vbsHelper.dim(['31'] as unknown as number[]).length).to.equal(32)
	})

	it('should round float bounds like CInt', () => {
		expect(vbsHelper.dim([3.7] as unknown as number[]).length).to.equal(5)
		expect(vbsHelper.dim([2.5] as unknown as number[]).length).to.equal(3)
	})

	it('should treat Empty bounds as 0', () => {
		expect(vbsHelper.dim([undefined] as unknown as number[]).length).to.equal(1)
		expect(vbsHelper.dim([new VbsUndefined()] as unknown as number[]).length).to.equal(1)
	})

	it('should raise error 13 for non-numeric bounds', () => {
		try {
			vbsHelper.dim(['abc'] as unknown as number[])
			expect.fail('should have raised error 13')
		} catch (e) {
			expect(e).to.be.an.instanceof(VbsError)
			expect((e as VbsError).code).to.equal(13)
		}
	})

	it('should record error 13 and return an empty array for non-numeric bounds under On Error Resume Next', () => {
		ERR.OnErrorResumeNext()
		expect(vbsHelper.dim(['abc'] as unknown as number[]).length).to.equal(0)
		expect(ERR.Number).to.equal(13)
	})

	it('should raise error 9 for negative bounds', () => {
		try {
			vbsHelper.dim([-1]).length
			expect.fail('should have raised error 9')
		} catch (e) {
			expect(e).to.be.an.instanceof(VbsError)
			expect((e as VbsError).code).to.equal(9)
		}
	})

	it('should raise error 94 for Null bounds', () => {
		try {
			vbsHelper.dim([null] as unknown as number[])
			expect.fail('should have raised error 94')
		} catch (e) {
			expect(e).to.be.an.instanceof(VbsError)
			expect((e as VbsError).code).to.equal(94)
		}
	})

	it('should visit Empty elements in For Each', () => {
		const scope: Record<string, unknown> = {}
		new Transpiler(table, new Player(table)).execute(
			'Dim a(2)\na(0) = "x"\nn = 0\nm = 0\nFor Each e In a\nn = n + 1\nIf IsEmpty(e) Then m = m + 1\nNext\n',
			scope,
		)
		expect(scope.n).to.equal(3)
		expect(scope.m).to.equal(2)
	})

	it('should iterate Dictionary keys in For Each', () => {
		const scope: Record<string, unknown> = {}
		new Transpiler(table, new Player(table)).execute(
			'Set d = CreateObject("Scripting.Dictionary")\nd.Add "a", 1\nd.Add "b", 2\ns = ""\nFor Each k In d\ns = s & k\nNext\n',
			scope,
		)
		expect(scope.s).to.equal('ab')
	})

	it('should re-arm throwing via onErrorGoto', () => {
		ERR.OnErrorResumeNext()
		vbsHelper.onErrorGoto()
		expect(() => ERR.Raise(new VbsError('boom', 513))).to.throw(VbsError)
	})

	it('should reduce a three-dimension array', () => {
		let js = vbsHelper.dim([2, 2, 3])
		js[0][0][1] = 'Test'
		js[0][0][2] = 'Test'
		js = vbsHelper.redim(js, [2, 2, 1])
		for (let index1 = 0; index1 <= 2; index1++) {
			for (let index2 = 0; index2 <= 2; index2++) {
				expect(js[index1][index2].length).to.equal(2)
			}
		}
		expect(js[0][0][1]).to.be.an.instanceof(VbsUndefined)
		expect(js[0][0][2]).to.be.an.instanceof(VbsUndefined)
	})

	it('should reduce and preserve a three-dimension array', () => {
		let js = vbsHelper.dim([2, 2, 3])
		js[0][0][1] = 'Test'
		js[0][0][2] = 'Test'
		js = vbsHelper.redim(js, [2, 2, 1], true)
		for (let index1 = 0; index1 <= 2; index1++) {
			for (let index2 = 0; index2 <= 2; index2++) {
				expect(js[index1][index2].length).to.equal(2)
			}
		}
		expect(js[0][0][1]).to.equal(`Test`)
		expect(js[0][0][2]).to.be.an.instanceof(VbsUndefined)
	})

	it('should expand a three-dimension array', () => {
		let js = vbsHelper.dim([2, 2, 3])
		js[0][0][3] = 'Test'
		js = vbsHelper.redim(js, [2, 2, 4])
		expect(js[0][0][3]).to.be.an.instanceof(VbsUndefined)
		for (let index1 = 0; index1 <= 2; index1++) {
			for (let index2 = 0; index2 <= 2; index2++) {
				expect(js[index1][index2].length).to.equal(5)
			}
		}
	})

	it('should expand and preserve a three-dimension array', () => {
		let js = vbsHelper.dim([2, 2, 3])
		js[0][0][3] = 'Test'
		js = vbsHelper.redim(js, [2, 2, 4], true)
		expect(js[0][0][3]).to.equal(`Test`)
		for (let index1 = 0; index1 <= 2; index1++) {
			for (let index2 = 0; index2 <= 2; index2++) {
				expect(js[index1][index2].length).to.equal(5)
			}
		}
	})

	it('should erase a three-dimension array', () => {
		let js = vbsHelper.dim([2, 2, 3])
		js[0][0][3] = 'Test'
		js = vbsHelper.erase(js)
		expect(js[0][0][3]).to.be.an.instanceof(VbsUndefined)
		for (let index1 = 0; index1 <= 2; index1++) {
			for (let index2 = 0; index2 <= 2; index2++) {
				for (let index3 = 0; index3 <= 3; index3++) {
					expect(js[index1][index2][index3]).to.be.an.instanceof(VbsUndefined)
				}
			}
		}
	})

	it('should perform integer division on two floating point numbers', () => {
		const js = vbsHelper.intDiv(6.8, 3.2)
		expect(js).to.be.equal(2)
	})

	it('should round operands before integer division', () => {
		expect(vbsHelper.intDiv(5.5, 2)).to.be.equal(3)
		expect(vbsHelper.intDiv(-7, 3)).to.be.equal(-2)
	})

	it('should perform value of x to the power of y', () => {
		const js = vbsHelper.exponent(3, 4)
		expect(js).to.be.equal(81)
	})

	it('should get a value in a single-dimension array using "getOrCall"', () => {
		const js = vbsHelper.dim([20])
		js[20] = 'Test'
		const _value = vbsHelper.getOrCall(js, 20)
		expect(js[20]).to.equal(`Test`)
	})

	it('should get a value in a three-dimension array using "getOrCall"', () => {
		const js = vbsHelper.dim([2, 2, 3])
		js[0][0][3] = 'Test'
		const value = vbsHelper.getOrCall(js, 0, 0, 3)
		expect(value).to.equal(`Test`)
	})

	it('should get the return value of a function using "getOrCall" and no params', () => {
		const js = () => {
			return 'Test'
		}
		const value = vbsHelper.getOrCall(js)
		expect(value).to.equal(`Test`)
	})

	it('should get the return value of a function using "getOrCall" and multiple params', () => {
		const js = (value1: number, value2: number, value3: number) => {
			return value1 + value2 + value3
		}
		const value = vbsHelper.getOrCall(js, 8, 10, 5)
		expect(value).to.equal(23)
	})

	it('should rethrow script errors from functions invoked with "getOrCall"', () => {
		expect(() =>
			vbsHelper.getOrCall(() => {
				throw new VbsError('Type mismatch', 13)
			}),
		).to.throw(VbsError)
	})

	it('should rethrow script errors from methods invoked with "getOrCallBound"', () => {
		const target = {
			bang(): never {
				throw new VbsError('Object required', 424)
			},
		}
		expect(() => vbsHelper.getOrCallBound(target, 'bang')).to.throw(VbsError)
	})

	it('should rethrow script errors from property reads in "getOrCall"', () => {
		const target = {}
		Object.defineProperty(target, 'boom', {
			get(): never {
				throw new VbsError('Cannot get property', 9)
			},
		})
		expect(() => vbsHelper.getOrCall(target, 'boom')).to.throw(VbsError)
	})

	it('should compare equals using "equals"', () => {
		expect(vbsHelper.equals(5, 5)).to.equal(true)
		expect(vbsHelper.equals(undefined, new VbsUndefined())).to.equal(true)
		expect(vbsHelper.equals(new VbsUndefined(), undefined)).to.equal(true)
		expect(vbsHelper.equals(new VbsUndefined(), new VbsUndefined())).to.equal(true)
		expect(vbsHelper.equals(new VbsUndefined(), '')).to.equal(true)
		expect(vbsHelper.equals('', new VbsUndefined())).to.equal(true)
	})

	it('should compare not equal using "equals"', () => {
		const value = vbsHelper.equals(5, 10)
		expect(value).to.equal(false)
	})

	it('should treat True as -1 using "equals"', () => {
		expect(vbsHelper.equals(true, -1)).to.equal(true)
		expect(vbsHelper.equals(-1, true)).to.equal(true)
		expect(vbsHelper.equals(true, 1)).to.equal(false)
		expect(vbsHelper.equals(false, 0)).to.equal(true)
	})

	it('should compare object equals using "is"', () => {
		const value = vbsHelper.is(5, 5)
		expect(value).to.equal(true)
	})

	it('should compare object not equal using "is"', () => {
		const value = vbsHelper.is(5, 10)
		expect(value).to.equal(false)
	})

	it('should treat unassigned variables as Nothing using "is"', () => {
		const nothing = new Stdlib().Nothing
		expect(vbsHelper.is(undefined, nothing)).to.equal(true)
		expect(vbsHelper.is(new VbsUndefined(), nothing)).to.equal(true)
		expect(vbsHelper.is(nothing, nothing)).to.equal(true)
		expect(vbsHelper.is({}, nothing)).to.equal(false)
		expect(vbsHelper.is(null, nothing)).to.equal(false)
	})

	it('should coerce numeric Eval arguments like VBScript', () => {
		const scope: Record<string, unknown> = {}
		new Transpiler(table, new Player(table)).execute('x = Eval(2)\n', scope)
		expect(scope.x).to.equal(2)
	})

	it('should evaluate bare expressions passed to Eval', () => {
		const scope: Record<string, unknown> = {}
		new Transpiler(table, new Player(table)).execute('x = Eval("1+2")\n', scope)
		expect(scope.x).to.equal(3)
	})

	it('should record Err for empty Eval under On Error Resume Next', () => {
		const scope: Record<string, unknown> = {}
		new Transpiler(table, new Player(table)).execute(
			'On Error Resume Next\nCall Eval("")\nIf Err Then w = 1\n',
			scope,
		)
		expect(scope.w).to.equal(1)
		expect(ERR.Number).to.equal(1002)
	})

	it('should record Err instead of throwing for Eval of a missing variable under On Error Resume Next', () => {
		const scope: Record<string, unknown> = {}
		new Transpiler(table, new Player(table)).execute(
			'On Error Resume Next\nCall Eval(NoSuchVariable)\nIf Err Then y = 1\n',
			scope,
		)
		expect(scope.y).to.equal(1)
		expect(ERR.Number).to.equal(13)
	})

	it('should throw a VbsError for Eval of a missing variable without On Error Resume Next', () => {
		const scope: Record<string, unknown> = {}
		expect(() => new Transpiler(table, new Player(table)).execute('Call Eval(NoSuchVariable)\n', scope)).to.throw(
			VbsError,
		)
	})

	it('should record Err instead of throwing for unparseable Eval under On Error Resume Next', () => {
		const scope: Record<string, unknown> = {}
		new Transpiler(table, new Player(table)).execute(
			'On Error Resume Next\nCall Eval("1 +")\nIf Err Then z = 1\n',
			scope,
		)
		expect(scope.z).to.equal(1)
		expect(ERR.Number).to.equal(1002)
	})

	it('should return undefined JS for Empty input to transpileInlineAsync under On Error Resume Next', async () => {
		ERR.OnErrorResumeNext()
		const js = await vbsHelper.transpileInlineAsync(new VbsUndefined())
		expect(js).to.equal('undefined')
		expect(ERR.Number).to.equal(13)
	})

	it('should return undefined JS for Empty input to transpileInline under On Error Resume Next', () => {
		ERR.OnErrorResumeNext()
		const js = vbsHelper.transpileInline(new VbsUndefined())
		expect(js).to.equal('undefined')
		expect(ERR.Number).to.equal(13)
	})

	it('should transpile VBS `protected` locals without emitting a strict-mode reserved word', () => {
		const scope: Record<string, unknown> = {}
		new Transpiler(table, new Player(table)).execute(
			'Sub F\nDim protected\nprotected = 5\nr = protected\nEnd Sub\nCall F\n',
			scope,
		)
		expect(scope.r).to.equal(5)
	})

	it('should record error 94 instead of 13 for Eval of Null under On Error Resume Next', () => {
		ERR.OnErrorResumeNext()
		expect(vbsHelper.transpileInline(null)).to.equal('undefined')
		expect(ERR.Number).to.equal(94)
	})

	it('should throw error 94 for Eval of Null without On Error Resume Next', () => {
		try {
			vbsHelper.transpileInline(null)
			expect.fail('should have raised error 94')
		} catch (e) {
			expect(e).to.be.an.instanceof(VbsError)
			expect((e as VbsError).code).to.equal(94)
		}
	})

	it('should raise error 94 when dereferencing Null', () => {
		for (const access of [
			() => vbsHelper.getOrCall(null, 'x'),
			() => vbsHelper.getOrCallBound(null, 'x'),
			() => vbsHelper.getOrCall({ n: null }, 'n', 'x'),
			() => vbsHelper.getOrCallBound({ n: null }, 'n', 'x'),
		]) {
			try {
				access()
				expect.fail('should have raised error 94')
			} catch (e) {
				expect(e).to.be.an.instanceof(VbsError)
				expect((e as VbsError).code).to.equal(94)
			}
		}
	})

	it('should record error 94 for Null member access under On Error Resume Next', () => {
		ERR.OnErrorResumeNext()
		expect(vbsHelper.getOrCall(null, 'x')).to.be.an.instanceof(VbsUndefined)
		expect(ERR.Number).to.equal(94)
		ERR.Clear()
		expect(vbsHelper.getOrCallBound(null, 'x')).to.be.an.instanceof(VbsUndefined)
		expect(ERR.Number).to.equal(94)
	})

	it('should keep yielding Empty for member access on Empty without recording an error', () => {
		ERR.OnErrorResumeNext()
		expect(vbsHelper.getOrCall(undefined, 'x')).to.be.an.instanceof(VbsUndefined)
		expect(vbsHelper.getOrCallBound(undefined, 'x')).to.be.an.instanceof(VbsUndefined)
		expect(ERR.Number).to.equal(0)
	})

	it('should raise error 91 when converting Nothing to a number', () => {
		const stdlib = new Stdlib()
		for (const convert of ['CByte', 'CInt', 'CLng', 'CSng', 'CDbl', 'CCur'] as const) {
			try {
				stdlib[convert](stdlib.Nothing)
				expect.fail(`should have raised error 91 for ${convert}`)
			} catch (e) {
				expect(e).to.be.an.instanceof(VbsError)
				expect((e as VbsError).code).to.equal(91)
			}
		}
	})

	it('should record error 91 for numeric conversion of Nothing under On Error Resume Next', () => {
		ERR.OnErrorResumeNext()
		const stdlib = new Stdlib()
		expect(stdlib.CInt(stdlib.Nothing)).to.equal(0)
		expect(ERR.Number).to.equal(91)
	})

	it('should resolve Eval names against scope globals, not procedure locals', () => {
		const scope: Record<string, unknown> = {}
		new Transpiler(table, new Player(table)).execute(
			'g = 1\nSub P\nDim g\ng = 2\nr = Eval("g")\nEnd Sub\nCall P\n',
			scope,
		)
		expect(scope.r).to.equal(1)
		expect(scope.g).to.equal(1)
	})

	it('should evaluate bare expressions passed to transpileInlineAsync', async () => {
		const js = await vbsHelper.transpileInlineAsync('1+2')
		expect(js).to.contain('__vbsEvalResult')
	})

	it('should record Err instead of throwing for empty and unparseable input to transpileInlineAsync under On Error Resume Next', async () => {
		ERR.OnErrorResumeNext()
		expect(await vbsHelper.transpileInlineAsync('')).to.equal('undefined')
		expect(ERR.Number).to.equal(1002)
		ERR.Clear()
		expect(await vbsHelper.transpileInlineAsync('1 +')).to.equal('undefined')
		expect(ERR.Number).to.equal(1002)
	})
})
