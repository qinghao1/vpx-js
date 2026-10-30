// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import { TableBuilder } from '../../../test/table-builder.js'
import { Player } from '../../game/player.js'
import type { Table } from '../../vpt/table/table.js'
import { Grammar } from '../grammar/grammar.js'
import { Transformer } from '../transformer/transformer.js'
import { Transpiler } from '../transpiler.js'

let grammar: Grammar

before(async () => {
	grammar = new Grammar()
})

describe('The VBScript transpiler - Method - Sub', () => {
	const cases: Array<[string, string, string]> = [
		[
			'a sub declaration with empty params',
			`Sub BallRelease_Hit()\nBallRelease.CreateBall\nEnd Sub`,
			'function BallRelease_Hit() {\n    BallRelease.CreateBall();\n}',
		],
		[
			'an inline sub declaration with empty params',
			`Sub BallRelease_Hit() BallRelease.CreateBall End Sub`,
			'function BallRelease_Hit() {\n    BallRelease.CreateBall();\n}',
		],
		[
			'a sub declaration with params',
			`Sub BallRelease_Hit(value1, value2, value3)\nBallRelease.CreateBall\nEnd Sub`,
			'function BallRelease_Hit(value1, value2, value3) {\n    BallRelease.CreateBall();\n}',
		],
		[
			'an inline sub declaration with params',
			`Sub BallRelease_Hit(value1, value2, value3) BallRelease.CreateBall End Sub`,
			'function BallRelease_Hit(value1, value2, value3) {\n    BallRelease.CreateBall();\n}',
		],
		[
			'a sub declaration with no params',
			`Sub BallRelease_Hit\nBallRelease.CreateBall\nEnd Sub`,
			'function BallRelease_Hit() {\n    BallRelease.CreateBall();\n}',
		],
		[
			'an inline sub declaration with no params',
			`Sub BallRelease_Hit BallRelease.CreateBall End Sub`,
			'function BallRelease_Hit() {\n    BallRelease.CreateBall();\n}',
		],
	]
	for (const [name, vbs, expected] of cases) {
		it(`should transpile ${name}`, () => {
			expect(grammar.vbsToJs(vbs)).to.equal(expected)
		})
	}
})

describe('The VBScript transpiler - Method - Function', () => {
	const cases: Array<[string, string, string]> = [
		[
			'a function with empty params',
			`Function BallRelease_Hit()\nBallRelease_Hit = BallRelease.CreateBall\nEnd Function`,
			'function BallRelease_Hit() {\n    let BallRelease_Hit = undefined;\n    BallRelease_Hit = BallRelease.CreateBall;\n    return BallRelease_Hit;\n}',
		],
		[
			'an empty function with empty params',
			`Function BallRelease_Hit()\nEnd Function`,
			'function BallRelease_Hit() {\n    let BallRelease_Hit = undefined;\n    return BallRelease_Hit;\n}',
		],
		[
			'an inline function with empty params',
			`Function BallRelease_Hit() BallRelease_Hit = BallRelease.CreateBall End Function`,
			'function BallRelease_Hit() {\n    let BallRelease_Hit = undefined;\n    BallRelease_Hit = BallRelease.CreateBall;\n    return BallRelease_Hit;\n}',
		],
		[
			'a function with params',
			`Function BallRelease_Hit(value1, value2, value3)\nBallRelease.CreateBall\nEnd Function`,
			'function BallRelease_Hit(value1, value2, value3) {\n    let BallRelease_Hit = undefined;\n    BallRelease.CreateBall();\n    return BallRelease_Hit;\n}',
		],
		[
			'a function with "ByVal/ByRef" params',
			`Function BallRelease_Hit(ByVal value1, ByRef value2)\nBallRelease.CreateBall\nEnd Function`,
			'function BallRelease_Hit(value1, value2) {\n    let BallRelease_Hit = undefined;\n    BallRelease.CreateBall();\n    return BallRelease_Hit;\n}',
		],
		[
			'an inline function with params',
			`Function BallRelease_Hit(value1, value2, value3) BallRelease.CreateBall End Function`,
			'function BallRelease_Hit(value1, value2, value3) {\n    let BallRelease_Hit = undefined;\n    BallRelease.CreateBall();\n    return BallRelease_Hit;\n}',
		],
		[
			'a function with params and exit',
			`Function MyFunction(value)\nMyFunction = 6\nif value = 5 Then\nMyFunction = 10\nExit Function\nEnd If\nEnd Function`,
			`function MyFunction(value) {\n    let MyFunction = undefined;\n    MyFunction = 6;\n    if (${Transformer.VBSHELPER_NAME}.isTrue(${Transformer.VBSHELPER_NAME}.equals(value, 5))) {\n        MyFunction = 10;\n        return MyFunction;\n    }\n    return MyFunction;\n}`,
		],
		[
			'a inline function with params and exit',
			`Function MyFunction(value) Exit Function End Function`,
			'function MyFunction(value) {\n    let MyFunction = undefined;\n    return MyFunction;\n}',
		],
		[
			'a function with no params',
			`Function BallRelease_Hit\nBallRelease_Hit = BallRelease.CreateBall\nEnd Function`,
			'function BallRelease_Hit() {\n    let BallRelease_Hit = undefined;\n    BallRelease_Hit = BallRelease.CreateBall;\n    return BallRelease_Hit;\n}',
		],
		[
			'an inline function with no params',
			`Function BallRelease_Hit BallRelease_Hit = BallRelease.CreateBall End Function`,
			'function BallRelease_Hit() {\n    let BallRelease_Hit = undefined;\n    BallRelease_Hit = BallRelease.CreateBall;\n    return BallRelease_Hit;\n}',
		],
	]
	for (const [name, vbs, expected] of cases) {
		it(`should transpile ${name}`, () => {
			expect(grammar.vbsToJs(vbs)).to.equal(expected)
		})
	}
})

describe('The VBScript transpiler - Method behavior', () => {
	let table: Table
	let player: Player

	before(async () => {
		table = new TableBuilder().build()
		player = new Player(table)
	})

	function execute(vbs: string): any {
		const scope = {} as any
		new Transpiler(table, player).execute(vbs, scope, 'global')
		return scope
	}

	it('should pass ByRef params without write-back (known divergence)', () => {
		// Known divergence: ByRef behaves like ByVal; the caller's variable is unchanged.
		expect(execute('Sub Inc(ByRef v)\nv = v + 1\nEnd Sub\nx = 10\nInc x').x).to.equal(10)
	})

	it('should return the current value on Exit Function', () => {
		// Locks the Exit Function coupling: branch.ts emits a bare `return`
		// that ppFunctionDeclaration fills with the function-name value.
		const scope = execute(
			'Function test(x)\ntest = 41\nIf x = 1 Then Exit Function\ntest = 99\nEnd Function\nr1 = test(1)\nr2 = test(2)',
		)
		expect(scope.r1).to.equal(41)
		expect(scope.r2).to.equal(99)
	})
})
