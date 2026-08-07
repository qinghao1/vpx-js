// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import { Grammar } from '../grammar/grammar.js'
import { Transformer } from '../transformer/transformer.js'

let grammar: Grammar

before(async () => {
	grammar = new Grammar()
})

describe('The VBScript transpiler - Method - Sub', () => {
	it('should transpile a sub declaration with empty params', () => {
		const vbs = `Sub BallRelease_Hit()\nBallRelease.CreateBall\nEnd Sub`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('function BallRelease_Hit() {\n    BallRelease.CreateBall();\n}')
	})

	it('should transpile an inline sub declaration with empty params', () => {
		const vbs = `Sub BallRelease_Hit() BallRelease.CreateBall End Sub`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('function BallRelease_Hit() {\n    BallRelease.CreateBall();\n}')
	})

	it('should transpile a sub declaration with params', () => {
		const vbs = `Sub BallRelease_Hit(value1, value2, value3)\nBallRelease.CreateBall\nEnd Sub`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('function BallRelease_Hit(value1, value2, value3) {\n    BallRelease.CreateBall();\n}')
	})

	it('should transpile an inline sub declaration with params', () => {
		const vbs = `Sub BallRelease_Hit(value1, value2, value3) BallRelease.CreateBall End Sub`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('function BallRelease_Hit(value1, value2, value3) {\n    BallRelease.CreateBall();\n}')
	})

	it('should transpile a sub declaration with no params', () => {
		const vbs = `Sub BallRelease_Hit\nBallRelease.CreateBall\nEnd Sub`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('function BallRelease_Hit() {\n    BallRelease.CreateBall();\n}')
	})

	it('should transpile an inline sub declaration with no params', () => {
		const vbs = `Sub BallRelease_Hit BallRelease.CreateBall End Sub`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('function BallRelease_Hit() {\n    BallRelease.CreateBall();\n}')
	})
})

describe('The VBScript transpiler - Method - Function', () => {
	it('should transpile a function with empty params', () => {
		const vbs = `Function BallRelease_Hit()\nBallRelease_Hit = BallRelease.CreateBall\nEnd Function`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			'function BallRelease_Hit() {\n    let BallRelease_Hit = undefined;\n    BallRelease_Hit = BallRelease.CreateBall;\n    return BallRelease_Hit;\n}',
		)
	})

	it('should transpile an empty function with empty params', () => {
		const vbs = `Function BallRelease_Hit()\nEnd Function`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			'function BallRelease_Hit() {\n    let BallRelease_Hit = undefined;\n    return BallRelease_Hit;\n}',
		)
	})

	it('should transpile an inline function with empty params', () => {
		const vbs = `Function BallRelease_Hit() BallRelease_Hit = BallRelease.CreateBall End Function`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			'function BallRelease_Hit() {\n    let BallRelease_Hit = undefined;\n    BallRelease_Hit = BallRelease.CreateBall;\n    return BallRelease_Hit;\n}',
		)
	})

	it('should transpile a function with params', () => {
		const vbs = `Function BallRelease_Hit(value1, value2, value3)\nBallRelease.CreateBall\nEnd Function`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			'function BallRelease_Hit(value1, value2, value3) {\n    let BallRelease_Hit = undefined;\n    BallRelease.CreateBall();\n    return BallRelease_Hit;\n}',
		)
	})

	it('should transpile a function with "ByVal/ByRef" params', () => {
		const vbs = `Function BallRelease_Hit(ByVal value1, ByRef value2)\nBallRelease.CreateBall\nEnd Function`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			'function BallRelease_Hit(value1, value2) {\n    let BallRelease_Hit = undefined;\n    BallRelease.CreateBall();\n    return BallRelease_Hit;\n}',
		)
	})

	it('should transpile an inline function with params', () => {
		const vbs = `Function BallRelease_Hit(value1, value2, value3) BallRelease.CreateBall End Function`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			'function BallRelease_Hit(value1, value2, value3) {\n    let BallRelease_Hit = undefined;\n    BallRelease.CreateBall();\n    return BallRelease_Hit;\n}',
		)
	})

	it('should transpile a function with params and exit', () => {
		const vbs = `Function MyFunction(value)\nMyFunction = 6\nif value = 5 Then\nMyFunction = 10\nExit Function\nEnd If\nEnd Function`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`function MyFunction(value) {\n    let MyFunction = undefined;\n    MyFunction = 6;\n    if (${Transformer.VBSHELPER_NAME}.equals(value, 5)) {\n        MyFunction = 10;\n        return MyFunction;\n    }\n    return MyFunction;\n}`,
		)
	})

	it('should transpile a inline function with params and exit', () => {
		const vbs = `Function MyFunction(value) Exit Function End Function`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('function MyFunction(value) {\n    let MyFunction = undefined;\n    return MyFunction;\n}')
	})

	it('should transpile a function with no params', () => {
		const vbs = `Function BallRelease_Hit\nBallRelease_Hit = BallRelease.CreateBall\nEnd Function`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			'function BallRelease_Hit() {\n    let BallRelease_Hit = undefined;\n    BallRelease_Hit = BallRelease.CreateBall;\n    return BallRelease_Hit;\n}',
		)
	})

	it('should transpile an inline function with no params', () => {
		const vbs = `Function BallRelease_Hit BallRelease_Hit = BallRelease.CreateBall End Function`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			'function BallRelease_Hit() {\n    let BallRelease_Hit = undefined;\n    BallRelease_Hit = BallRelease.CreateBall;\n    return BallRelease_Hit;\n}',
		)
	})
})
