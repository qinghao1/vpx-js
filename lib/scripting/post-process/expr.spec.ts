// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import { TableBuilder } from '../../../test/table-builder.js'
import { Player } from '../../game/player.js'
import type { Table } from '../../vpt/table/table.js'
import { Grammar } from '../grammar/grammar.js'
import { ERR, VbsError } from '../stdlib/err.js'
import { Transformer } from '../transformer/transformer.js'
import { Transpiler } from '../transpiler.js'

let grammar: Grammar

before(async () => {
	grammar = new Grammar()
})

describe('The VBScript transpiler - Expressions', () => {
	it('should transpile a "Eqv" expression', () => {
		const vbs = `EnableBallControl = 10 Eqv 8`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(`EnableBallControl = ${Transformer.VBSHELPER_NAME}.eqv(10, 8);`)
	})

	it('should transpile a "Xor" expression', () => {
		const vbs = `EnableBallControl = 10 Xor 8`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(`EnableBallControl = ${Transformer.VBSHELPER_NAME}.xor(10, 8);`)
	})

	it('should transpile a "Or" expression', () => {
		const vbs = `If test = 5 Or Err Then test = 6`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`if (${Transformer.VBSHELPER_NAME}.isTrue(${Transformer.VBSHELPER_NAME}.or(${Transformer.VBSHELPER_NAME}.equals(test, 5), Err))) {\n    test = 6;\n}`,
		)
	})

	it('should transpile a "And" expression', () => {
		const vbs = `If test = 5 And Err Then test = 6`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`if (${Transformer.VBSHELPER_NAME}.isTrue(${Transformer.VBSHELPER_NAME}.and(${Transformer.VBSHELPER_NAME}.equals(test, 5), Err))) {\n    test = 6;\n}`,
		)
	})

	it('should transpile a "Not" expression', () => {
		const vbs = `EnableBallControl = Not EnableBallControl`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(`EnableBallControl = ${Transformer.VBSHELPER_NAME}.not(EnableBallControl);`)
	})

	it('should transpile a "+" expression', () => {
		const vbs = `EnableBallControl = EnableBallControl + 1`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(`EnableBallControl = ${Transformer.VBSHELPER_NAME}.add(EnableBallControl, 1);`)
	})

	it('should transpile a "-" expression', () => {
		const vbs = `EnableBallControl = EnableBallControl - 1`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(`EnableBallControl = ${Transformer.VBSHELPER_NAME}.sub(EnableBallControl, 1);`)
	})

	it('should transpile a "Mod" expression', () => {
		const vbs = `EnableBallControl = EnableBallControl Mod 2`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(`EnableBallControl = ${Transformer.VBSHELPER_NAME}.mod(EnableBallControl, 2);`)
	})

	it('should transpile a "\\" expression', () => {
		const vbs = `EnableBallControl = EnableBallControl \\ 2`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(`EnableBallControl = ${Transformer.VBSHELPER_NAME}.intDiv(EnableBallControl, 2);`)
	})

	it('should transpile a "*" expression', () => {
		const vbs = `EnableBallControl = EnableBallControl * 2`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(`EnableBallControl = ${Transformer.VBSHELPER_NAME}.mul(EnableBallControl, 2);`)
	})

	it('should transpile a "*" unary expression', () => {
		const vbs = `EnableBallControl = EnableBallControl * -2`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(`EnableBallControl = ${Transformer.VBSHELPER_NAME}.mul(EnableBallControl, -2);`)
	})

	it('should transpile a "/" expression', () => {
		const vbs = `EnableBallControl = EnableBallControl / 2`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(`EnableBallControl = ${Transformer.VBSHELPER_NAME}.div(EnableBallControl, 2);`)
	})

	it('should transpile a "^" expression', () => {
		const vbs = `EnableBallControl = EnableBallControl ^ 2`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(`EnableBallControl = ${Transformer.VBSHELPER_NAME}.exponent(EnableBallControl, 2);`)
	})

	it('should transpile a "&" concat expression', () => {
		const vbs = `EnableBallControl = "ENABLE" & "OFF"`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(`EnableBallControl = ${Transformer.VBSHELPER_NAME}.concat('ENABLE', 'OFF');`)
	})

	it('should bind "+" tighter than "&"', () => {
		const vbs = `EnableBallControl = "a" & 1 + 2`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`EnableBallControl = ${Transformer.VBSHELPER_NAME}.concat('a', ${Transformer.VBSHELPER_NAME}.add(1, 2));`,
		)
	})

	it('should group a numbered sound name as prefix & (base + 1)', () => {
		const vbs = `x = "Rollover_" & Int(Rnd * 4) + 1`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`x = ${Transformer.VBSHELPER_NAME}.concat('Rollover_', ${Transformer.VBSHELPER_NAME}.add(Int(${Transformer.VBSHELPER_NAME}.mul(Rnd, 4)), 1));`,
		)
	})

	it('should transpile a "Is" expression', () => {
		const vbs = `EnableBallControl = EnableBallControl Is 2`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(`EnableBallControl = ${Transformer.VBSHELPER_NAME}.is(EnableBallControl, 2);`)
	})

	it('should transpile ">=" and "=>" expressions identically', () => {
		const expected = `EnableBallControl = ${Transformer.VBSHELPER_NAME}.gte(EnableBallControl, 2);`
		expect(grammar.vbsToJs(`EnableBallControl = EnableBallControl >= 2`)).to.equal(expected)
		expect(grammar.vbsToJs(`EnableBallControl = EnableBallControl => 2`)).to.equal(expected)
	})

	it('should transpile "<=" and "=<" expressions identically', () => {
		const expected = `EnableBallControl = ${Transformer.VBSHELPER_NAME}.lte(EnableBallControl, 2);`
		expect(grammar.vbsToJs(`EnableBallControl = EnableBallControl <= 2`)).to.equal(expected)
		expect(grammar.vbsToJs(`EnableBallControl = EnableBallControl =< 2`)).to.equal(expected)
	})

	it('should transpile a ">" expression', () => {
		const vbs = `EnableBallControl = EnableBallControl > 2`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(`EnableBallControl = ${Transformer.VBSHELPER_NAME}.gt(EnableBallControl, 2);`)
	})

	it('should transpile a "<" expression', () => {
		const vbs = `EnableBallControl = EnableBallControl < 2`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(`EnableBallControl = ${Transformer.VBSHELPER_NAME}.lt(EnableBallControl, 2);`)
	})

	it('should transpile "<>" and "><" expressions identically', () => {
		const expected = `EnableBallControl = ${Transformer.VBSHELPER_NAME}.notEquals(EnableBallControl, 2);`
		expect(grammar.vbsToJs(`EnableBallControl = EnableBallControl <> 2`)).to.equal(expected)
		expect(grammar.vbsToJs(`EnableBallControl = EnableBallControl >< 2`)).to.equal(expected)
	})

	it('should transpile a "=" expression', () => {
		const vbs = `EnableBallControl = EnableBallControl = 2`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(`EnableBallControl = ${Transformer.VBSHELPER_NAME}.equals(EnableBallControl, 2);`)
	})

	it('should transpile a "Me" expression', () => {
		const vbs = `EnableBallControl = Me`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(`EnableBallControl = this;`)
	})
})

describe('The VBScript transpiler - Concatenation behavior', () => {
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

	it('should concatenate numbers as strings instead of adding them', () => {
		expect(execute('x = 1 & 2').x).to.equal('12')
	})

	it('should concatenate mixed strings and numbers', () => {
		expect(execute('x = "Score: " & 100').x).to.equal('Score: 100')
	})

	it('should stringify booleans like VBScript', () => {
		expect(execute('x = True & False').x).to.equal('TrueFalse')
	})

	it('should chain more than two operands left to right', () => {
		expect(execute('x = 1 & 2 & 3').x).to.equal('123')
	})

	it('should treat Empty as an empty string', () => {
		expect(execute('x = Empty & "x"').x).to.equal('x')
	})

	it('should compare concatenated results', () => {
		expect(execute('If "a" & "b" = "ab" Then x = 1').x).to.equal(1)
	})

	it('should evaluate "+" before "&"', () => {
		expect(execute('x = "a" & 1 + 2').x).to.equal('a3')
	})

	it('should build numbered sound names without a type mismatch', () => {
		expect(execute('x = "Rollover_" & 0 + 1').x).to.equal('Rollover_1')
	})

	it('should propagate Null through "&"', () => {
		expect(execute('x = "a" & Null').x).to.be.null
		expect(execute('x = Null & "a"').x).to.be.null
		expect(execute('x = Null & Null').x).to.be.null
		expect(execute('x = "a" & Null & "b"').x).to.be.null
	})

	it('should read a variable holding Null back as Null in "&"', () => {
		expect(execute('n = Null\nx = "a" & n').x).to.be.null
		expect(execute('n = Null\nx = IsNull(n)').x).to.equal(true)
	})

	it('should raise error 94 for CStr(Null)', () => {
		expect(() => execute('x = CStr(Null)')).to.throw(VbsError)
	})

	it('should record error 94 for CStr(Null) under On Error Resume Next', () => {
		const scope = execute('On Error Resume Next\nx = CStr(Null)\ny = Err.Number')
		expect(scope.x).to.equal('')
		expect(scope.y).to.equal(94)
		expect(ERR.Number).to.equal(94)
		ERR.Clear()
		ERR.OnErrorGoto0()
	})
})

describe('The VBScript transpiler - Ordering comparison behavior', () => {
	let table: Table
	let player: Player

	before(async () => {
		table = new TableBuilder().build()
		player = new Player(table)
	})

	afterEach(() => {
		ERR.Clear()
		ERR.OnErrorGoto0()
	})

	function execute(vbs: string): any {
		const scope = {} as any
		new Transpiler(table, player).execute(vbs, scope, 'global')
		return scope
	}

	it('should yield Null (falsy) for any Null ordering comparison', () => {
		expect(execute('If Null < 1 Then x = 1 Else x = 2').x).to.equal(2)
		expect(execute('If Null <= 1 Then x = 1 Else x = 2').x).to.equal(2)
		expect(execute('If Null > 1 Then x = 1 Else x = 2').x).to.equal(2)
		expect(execute('If Null >= 1 Then x = 1 Else x = 2').x).to.equal(2)
		expect(execute('If 1 < Null Then x = 1 Else x = 2').x).to.equal(2)
	})

	it('should compare True as -1 in ordering comparisons', () => {
		expect(execute('If True > 0 Then x = 1 Else x = 2').x).to.equal(2)
		expect(execute('If True < 0 Then x = 1 Else x = 2').x).to.equal(1)
		expect(execute('If True <= -1 Then x = 1 Else x = 2').x).to.equal(1)
		expect(execute('If False < 1 Then x = 1 Else x = 2').x).to.equal(1)
	})

	it('should coerce Empty to 0 or "" depending on context', () => {
		expect(execute('Dim e\nIf e < 1 Then x = 1 Else x = 2').x).to.equal(1)
		expect(execute('Dim e\nIf e > -1 Then x = 1 Else x = 2').x).to.equal(1)
		expect(execute('Dim e\nIf e < "a" Then x = 1 Else x = 2').x).to.equal(1)
		expect(execute('Dim e\nIf e >= "" Then x = 1 Else x = 2').x).to.equal(1)
	})

	it('should compare two strings textually and numeric strings numerically against numbers', () => {
		expect(execute('If "10" < "9" Then x = 1 Else x = 2').x).to.equal(1)
		expect(execute('If "10" < 9 Then x = 1 Else x = 2').x).to.equal(2)
		expect(execute('If "6" >= "12" Then x = 1 Else x = 2').x).to.equal(1)
	})

	it('should not raise for a number against a non-numeric string (numeric side is less)', () => {
		// Documented Variant rule, not a type mismatch: the numeric expression
		// is unconditionally less than the string expression.
		expect(execute('If "a" < 1 Then x = 1 Else x = 2').x).to.equal(2)
		expect(execute('If 1 < "a" Then x = 1 Else x = 2').x).to.equal(1)
	})

	it('should record no error for mixed comparisons under On Error Resume Next', () => {
		const scope = execute('On Error Resume Next\nIf "a" < 1 Then x = 1 Else x = 2\ny = Err.Number')
		expect(scope.x).to.equal(2)
		expect(scope.y).to.equal(0)
	})

	it('should evaluate Not over an ordering comparison as a whole', () => {
		expect(execute('If Not 1 < 2 Then x = 1 Else x = 2').x).to.equal(2)
		expect(execute('If Not Null < 1 Then x = 1 Else x = 2').x).to.equal(2)
	})
})

describe('The VBScript transpiler - Arithmetic operator behavior', () => {
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

	it('should add numbers and numeric strings numerically', () => {
		expect(execute('x = 1 + 2').x).to.equal(3)
		expect(execute('x = "1" + "2"').x).to.equal(3)
		expect(execute('x = True + 1').x).to.equal(0)
	})

	it('should concatenate non-numeric strings with "+"', () => {
		expect(execute('x = "a" + "b"').x).to.equal('ab')
		expect(execute('x = "a" + "1"').x).to.equal('a1')
	})

	it('should propagate Null and Empty through "+"', () => {
		expect(execute('x = Null + 1').x).to.be.null
		expect(execute('x = Empty + 1').x).to.equal(1)
		expect(execute('x = Empty + True').x).to.equal(-1)
	})

	it('should raise error 13 for Empty plus non-numeric text', () => {
		try {
			execute('x = Empty + "a"')
			expect.fail('should have raised error 13')
		} catch (e) {
			expect(e).to.be.an.instanceof(VbsError)
			expect((e as VbsError).code).to.equal(13)
			expect((e as Error).message).to.equal('Type mismatch')
		}
		const scope = execute('On Error Resume Next\nx = Empty + "a"\ny = Err.Number')
		expect(scope.y).to.equal(13)
	})

	it('should subtract and multiply with VBScript semantics', () => {
		expect(execute('x = 5 - 2').x).to.equal(3)
		expect(execute('x = 10 - 2 * 3').x).to.equal(4)
		expect(execute('Dim t\nt = True\nx = t - 1').x).to.equal(-2)
		expect(execute('x = True * 2').x).to.equal(-2)
		expect(execute('x = False * 5').x).to.equal(0)
		expect(execute('x = "6" * "2"').x).to.equal(12)
		expect(execute('x = (Null) - 1').x).to.be.null
		expect(execute('x = Null * 2').x).to.be.null
	})

	it('should treat missing arguments as Empty in "-" and "*"', () => {
		expect(execute('Function F(a, b)\nF = a - b\nEnd Function\nx = F(5)').x).to.equal(5)
		expect(execute('Function G(a, b)\nG = a * b\nEnd Function\nx = G(5)').x).to.equal(0)
	})

	it('should not mistrigger "+" type mismatch for drop-target geometry with missing operands (InRect)', () => {
		const scope = execute(
			'Function InRectDT(px, py, ax, ay, bx, by, cx, cy, dx, dy)\n' +
				'Dim AB\n' +
				'AB = (bx * py) - (by * px) - (ax * py) + (ay * px) + (ax * by) - (ay * bx)\n' +
				'InRectDT = AB\n' +
				'End Function\n' +
				'x = InRectDT(1, 2, 3, 4, 5)',
		)
		expect(scope.x).to.equal(-12)
	})

	it('should divide with VBScript semantics', () => {
		expect(execute('x = 7 / 2').x).to.equal(3.5)
		expect(execute('x = "6" / "2"').x).to.equal(3)
		expect(execute('x = Null / 2').x).to.be.null
	})

	it('should round operands for "Mod"', () => {
		expect(execute('x = 5.5 Mod 2').x).to.equal(0)
		expect(execute('x = 7 Mod 3').x).to.equal(1)
		expect(execute('x = Null Mod 2').x).to.be.null
	})

	it('should yield Null (falsy) for any Null "<>" comparison', () => {
		expect(execute('If Null <> Null Then x = 1 Else x = 2').x).to.equal(2)
		expect(execute('If Null <> 1 Then x = 1 Else x = 2').x).to.equal(2)
		expect(execute('If 1 <> 2 Then x = 1 Else x = 2').x).to.equal(1)
	})

	it('should execute an empty script as a no-op', () => {
		for (const vbs of ['', '   \n', "' just a comment\n"]) {
			expect(() => execute(vbs), JSON.stringify(vbs)).not.to.throw()
		}
	})
})

describe('The VBScript transpiler - Logical operator behavior', () => {
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

	it('should evaluate And/Or/Xor bitwise without short-circuit', () => {
		expect(execute('x = 5 And 3').x).to.equal(1)
		expect(execute('x = 1 And 2').x).to.equal(0)
		expect(execute('x = 1 Or 2').x).to.equal(3)
		expect(execute('x = 10 Xor 8').x).to.equal(2)
	})

	it('should evaluate Not as a bitwise complement', () => {
		expect(execute('x = Not 5').x).to.equal(-6)
		expect(execute('x = Not 0').x).to.equal(-1)
	})

	it('should keep boolean operands boolean', () => {
		expect(execute('x = True And False').x).to.equal(false)
		expect(execute('x = False Or False').x).to.equal(false)
		expect(execute('x = Not True').x).to.equal(false)
		expect(execute('x = True Xor False').x).to.equal(true)
	})

	it('should convert mixed booleans via True=-1', () => {
		expect(execute('x = True And 5').x).to.equal(5)
		expect(execute('x = False Or 5').x).to.equal(5)
	})

	it('should evaluate Eqv as bitwise equivalence', () => {
		expect(execute('x = 10 Eqv 8').x).to.equal(-3)
		expect(execute('x = True Eqv False').x).to.equal(false)
		expect(execute('x = False Eqv False').x).to.equal(true)
	})

	it('should propagate Null per the VBScript truth tables', () => {
		expect(execute('x = Null And False').x).to.equal(false)
		expect(execute('x = Null And True').x).to.be.null
		expect(execute('x = Null Or True').x).to.equal(true)
		expect(execute('x = Null Or False').x).to.be.null
		expect(execute('x = Null Xor True').x).to.be.null
		expect(execute('x = Null Eqv Null').x).to.be.null
		expect(execute('x = Not Null').x).to.be.null
	})

	it('should branch on bitwise results', () => {
		expect(execute('If 1 And 2 Then x = 1 Else x = 2').x).to.equal(2)
		expect(execute('If True Eqv False Then x = 1 Else x = 2').x).to.equal(2)
		expect(execute('If Not 0 Then x = 1 Else x = 2').x).to.equal(1)
	})

	it('should bind Not to the whole comparison', () => {
		expect(execute('If Not 1 = 2 Then x = 1 Else x = 2').x).to.equal(1)
		expect(execute('If Not 1 = 1 Then x = 1 Else x = 2').x).to.equal(2)
		expect(execute('If Not 1 <> 1 Then x = 1 Else x = 2').x).to.equal(1)
	})

	it('should always evaluate both operands', () => {
		const counterFn = `counter = 0
Function Poke()
	counter = counter + 1
	Poke = True
End Function`
		const andScope = execute(`${counterFn}\nx = False And Poke()`)
		expect(andScope.x).to.equal(false)
		expect(andScope.counter).to.equal(1)
		const orScope = execute(`${counterFn}\nx = True Or Poke()`)
		expect(orScope.x).to.equal(true)
		expect(orScope.counter).to.equal(1)
		expect(execute(`${counterFn}\nx = Poke() Xor Poke()`).counter).to.equal(2)
	})

	it('should honor Err.Number in logical expressions', () => {
		expect(
			execute('On Error Resume Next : Err.Raise 13 : If False Or Err Then x = 1 Else x = 2 : Err.Clear').x,
		).to.equal(1)
		expect(execute('On Error Resume Next : Err.Clear : If False Or Err Then x = 1 Else x = 2').x).to.equal(2)
		expect(
			execute('On Error Resume Next : Err.Raise 13 : If True And Err Then x = 1 Else x = 2 : Err.Clear').x,
		).to.equal(1)
		expect(execute('On Error Resume Next : Err.Clear : If True And Err Then x = 1 Else x = 2').x).to.equal(2)
	})

	it('should coerce floats, strings and Empty to operands', () => {
		expect(execute('x = 5.5 And 3').x).to.equal(2)
		expect(execute('x = "6" And 3').x).to.equal(2)
		expect(execute('x = Empty And 5').x).to.equal(0)
	})

	it('should evaluate Eqv over the full boolean table', () => {
		expect(execute('x = True Eqv True').x).to.equal(true)
		expect(execute('x = False Eqv True').x).to.equal(false)
	})

	it('should compare object identity with Is Nothing', () => {
		expect(execute('Set x = Nothing\nIf x Is Nothing Then y = 1 Else y = 0').y).to.equal(1)
		expect(execute('x = 5\nIf x Is Nothing Then y = 1 Else y = 0').y).to.equal(0)
	})
})
