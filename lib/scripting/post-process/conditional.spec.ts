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

describe('The VBScript transpiler - Conditional', () => {
	it('should transpile an "If/Then...End If" statement', () => {
		const vbs = `If EnableBallControl = 1 Then\nEnableBallControl = 0\nEnd If`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`if (${Transformer.VBSHELPER_NAME}.isTrue(${Transformer.VBSHELPER_NAME}.equals(EnableBallControl, 1))) {\n    EnableBallControl = 0;\n}`,
		)
	})

	it('should transpile an inline "If/Then...End If" statement', () => {
		const vbs = `If EnableBallControl = 1 Then EnableBallControl = 0 End If`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`if (${Transformer.VBSHELPER_NAME}.isTrue(${Transformer.VBSHELPER_NAME}.equals(EnableBallControl, 1))) {\n    EnableBallControl = 0;\n}`,
		)
	})

	it('should transpile an inline "If/Then" statement', () => {
		const vbs = `If EnableBallControl = 1 Then EnableBallControl = 0`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`if (${Transformer.VBSHELPER_NAME}.isTrue(${Transformer.VBSHELPER_NAME}.equals(EnableBallControl, 1))) {\n    EnableBallControl = 0;\n}`,
		)
	})

	it('should transpile an inline "If/Then...Else...End If" statement', () => {
		const vbs = `If EnableBallControl = 1 Then EnableBallControl = 0 Else EnableBallControl = 2 End If`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`if (${Transformer.VBSHELPER_NAME}.isTrue(${Transformer.VBSHELPER_NAME}.equals(EnableBallControl, 1))) {\n    EnableBallControl = 0;\n} else {\n    EnableBallControl = 2;\n}`,
		)
	})

	it('should transpile an inline "If/Then...Else" statement', () => {
		const vbs = `If EnableBallControl = 1 Then EnableBallControl = 0 Else EnableBallControl = 2`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`if (${Transformer.VBSHELPER_NAME}.isTrue(${Transformer.VBSHELPER_NAME}.equals(EnableBallControl, 1))) {\n    EnableBallControl = 0;\n} else {\n    EnableBallControl = 2;\n}`,
		)
	})

	it('should transpile an "If/Then...Else...End If" statement', () => {
		const vbs = `If EnableBallControl = 1 Then\nEnableBallControl = 0\nEnableBallControl = 3\nElse\nEnableBallControl = 1\nEnableBallControl = 2\nEnd If`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`if (${Transformer.VBSHELPER_NAME}.isTrue(${Transformer.VBSHELPER_NAME}.equals(EnableBallControl, 1))) {\n    EnableBallControl = 0;\n    EnableBallControl = 3;\n} else {\n    EnableBallControl = 1;\n    EnableBallControl = 2;\n}`,
		)
	})

	it('should transpile an "If/Then...ElseIf/Then...End If" statement', () => {
		const vbs = `If DayOfWeek = "MON" Then\nDay = 1\nElseIf DayOfWeek = "TUE" Then\nDay = 2\nElseIf DayOfWeek = "WED" Then\nDay=3\nEnd If`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`if (${Transformer.VBSHELPER_NAME}.isTrue(${Transformer.VBSHELPER_NAME}.equals(DayOfWeek, 'MON'))) {\n    Day = 1;\n} else if (${Transformer.VBSHELPER_NAME}.isTrue(${Transformer.VBSHELPER_NAME}.equals(DayOfWeek, 'TUE'))) {\n    Day = 2;\n} else if (${Transformer.VBSHELPER_NAME}.isTrue(${Transformer.VBSHELPER_NAME}.equals(DayOfWeek, 'WED'))) {\n    Day = 3;\n}`,
		)
	})

	it('should transpile an "If/Then...ElseIf/Then...ElseIf/Then...Else...End If" statement', () => {
		const vbs = `If DayOfWeek = "MON" Then\nDay = 1\nElseIf DayOfWeek = "TUE" Then\nDay = 2\nElseIf DayOfWeek = "WED" Then\nDay=3\nElse\nDay = 0\nEnd If`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`if (${Transformer.VBSHELPER_NAME}.isTrue(${Transformer.VBSHELPER_NAME}.equals(DayOfWeek, 'MON'))) {\n    Day = 1;\n} else if (${Transformer.VBSHELPER_NAME}.isTrue(${Transformer.VBSHELPER_NAME}.equals(DayOfWeek, 'TUE'))) {\n    Day = 2;\n} else if (${Transformer.VBSHELPER_NAME}.isTrue(${Transformer.VBSHELPER_NAME}.equals(DayOfWeek, 'WED'))) {\n    Day = 3;\n} else {\n    Day = 0;\n}`,
		)
	})

	it('should transpile an "If/Then" with inline "ElseIf" statements', () => {
		const vbs = `If Lampstate(130)=0 Then\nColorGradeImage="ColorGrade_off"\nElseIf LampState(130)>0 Then ColorGradeImage="ColorGrade_red"\nElseIf LampState(130)=0 Then ColorGradeImage="ColorGrade_blue":x=5\nElse\nColorGradeImage="ColorGrade_on"\nEnd If`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`if (${Transformer.VBSHELPER_NAME}.isTrue(${Transformer.VBSHELPER_NAME}.equals(Lampstate(130), 0))) {\n    ColorGradeImage = 'ColorGrade_off';\n} else if (${Transformer.VBSHELPER_NAME}.isTrue(${Transformer.VBSHELPER_NAME}.gt(LampState(130), 0))) {\n    ColorGradeImage = 'ColorGrade_red';\n} else if (${Transformer.VBSHELPER_NAME}.isTrue(${Transformer.VBSHELPER_NAME}.equals(LampState(130), 0))) {\n    ColorGradeImage = 'ColorGrade_blue';\n    x = 5;\n} else {\n    ColorGradeImage = 'ColorGrade_on';\n}`,
		)
	})

	it('should transpile an "If/Then" statement with a member expression that matches a keyword', () => {
		const vbs = `If Error.Number<>0 Then UltraDMD=Null:Exit Function`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`if (${Transformer.VBSHELPER_NAME}.isTrue(${Transformer.VBSHELPER_NAME}.notEquals(Error.Number, 0))) {\n    UltraDMD = Null;\n    return;\n}`,
		)
	})

	it('should transpile an empty "Select Case...End Select" statement', () => {
		const vbs = `Select Case day\nEnd Select`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('day;')
	})

	it('should transpile a "Select Case...End Select" statement', () => {
		const vbs = `Select Case text\nCase "Sunday"\nday=0\nCase "Monday"\nday=1\nCase "Tuesday"\nday=2\nCase "Wednesday"\nday=3\nEnd Select`
		const js = grammar.vbsToJs(vbs)
		const vbsHelper = Transformer.VBSHELPER_NAME
		expect(js).to.equal(
			`{\n    let __vbsSelect = text;\n    if (${vbsHelper}.equals(__vbsSelect, 'Sunday')) {\n        day = 0;\n    } else if (${vbsHelper}.equals(__vbsSelect, 'Monday')) {\n        day = 1;\n    } else if (${vbsHelper}.equals(__vbsSelect, 'Tuesday')) {\n        day = 2;\n    } else if (${vbsHelper}.equals(__vbsSelect, 'Wednesday')) {\n        day = 3;\n    }\n}`,
		)
	})

	it('should transpile an empty "Select Case...Case...End Select" statement', () => {
		const vbs = `Select Case day\nCase "Sunday"\nEnd Select`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`{\n    let __vbsSelect = day;\n    if (${Transformer.VBSHELPER_NAME}.equals(__vbsSelect, 'Sunday')) {\n    }\n}`,
		)
	})

	it('should transpile a "Select Case/Case...End Select" statement', () => {
		const vbs = `Select Case text\nCase "Saturday", "Sunday"\nweekend=1\nCase "Monday"\nweekend=0\nEnd Select`
		const js = grammar.vbsToJs(vbs)
		const vbsHelper = Transformer.VBSHELPER_NAME
		expect(js).to.equal(
			`{\n    let __vbsSelect = text;\n    if (${vbsHelper}.equals(__vbsSelect, 'Saturday') || ${vbsHelper}.equals(__vbsSelect, 'Sunday')) {\n        weekend = 1;\n    } else if (${vbsHelper}.equals(__vbsSelect, 'Monday')) {\n        weekend = 0;\n    }\n}`,
		)
	})

	it('should transpile a "Select Case/Case...Else...End Select" statement', () => {
		const vbs = `Select Case text\nCase "Saturday", "Sunday"\nweekend=1\nCase Else\nweekend=0\nEnd Select`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`{\n    let __vbsSelect = text;\n    if (${Transformer.VBSHELPER_NAME}.equals(__vbsSelect, 'Saturday') || ${Transformer.VBSHELPER_NAME}.equals(__vbsSelect, 'Sunday')) {\n        weekend = 1;\n    } else {\n        weekend = 0;\n    }\n}`,
		)
	})

	it('should transpile a "Select Case/Case...Else...End Select" statement with inline cases', () => {
		const vbs = `Select Case text\nCase "Saturday", "Sunday" weekend=1\nCase Else weekend=0\nEnd Select`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`{\n    let __vbsSelect = text;\n    if (${Transformer.VBSHELPER_NAME}.equals(__vbsSelect, 'Saturday') || ${Transformer.VBSHELPER_NAME}.equals(__vbsSelect, 'Sunday')) {\n        weekend = 1;\n    } else {\n        weekend = 0;\n    }\n}`,
		)
	})

	it('should use distinct temps for nested "Select Case" statements', () => {
		const vbs = `Select Case a\nCase 1\nSelect Case b\nCase 2\ny = 1\nEnd Select\nEnd Select`
		const js = grammar.vbsToJs(vbs)
		const vbsHelper = Transformer.VBSHELPER_NAME
		expect(js).to.equal(
			`{\n    let __vbsSelect = a;\n    if (${vbsHelper}.equals(__vbsSelect, 1)) {\n        {\n            let __vbsSelect1 = b;\n            if (${vbsHelper}.equals(__vbsSelect1, 2)) {\n                y = 1;\n            }\n        }\n    }\n}`,
		)
	})
})

describe('The VBScript transpiler - Conditional behavior', () => {
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

	it('should match True against -1 like VBS `=`', () => {
		const vbs = `x = -1\nSelect Case x\nCase True\ny = 1\nCase Else\ny = 2\nEnd Select`
		expect(execute(vbs).y).to.equal(1)
	})

	it('should match Empty against 0 like VBS `=`', () => {
		const vbs = `Select Case Empty\nCase 0\ny = 1\nCase Else\ny = 2\nEnd Select`
		expect(execute(vbs).y).to.equal(1)
	})

	it('should not match Null against anything', () => {
		const vbs = `Select Case Null\nCase Null\ny = 1\nCase Else\ny = 2\nEnd Select`
		expect(execute(vbs).y).to.equal(2)
	})

	it('should not fall through an empty Case', () => {
		const vbs = `x = 1\nSelect Case x\nCase 1\nCase 2\ny = 1\nCase Else\ny = 2\nEnd Select`
		expect(execute(vbs).y).to.equal(undefined)
	})

	it('should evaluate the discriminant once', () => {
		const vbs = `n = 0\nFunction nextDisc\nn = n + 1\nnextDisc = 2\nEnd Function\nSelect Case nextDisc\nCase 1\ny = 1\nCase 2\ny = 2\nEnd Select`
		const scope = execute(vbs)
		expect(scope.y).to.equal(2)
		expect(scope.n).to.equal(1)
	})

	it('should run nested selects independently', () => {
		const vbs = `a = 1\nb = 2\nSelect Case a\nCase 1\nSelect Case b\nCase 2\ny = 9\nCase Else\ny = 8\nEnd Select\nCase Else\ny = 7\nEnd Select`
		expect(execute(vbs).y).to.equal(9)
	})
})
