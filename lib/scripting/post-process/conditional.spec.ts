// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import { Grammar } from '../grammar/grammar.js'
import { Transformer } from '../transformer/transformer.js'

let grammar: Grammar

before(async () => {
	grammar = new Grammar()
})

describe('The VBScript transpiler - Conditional', () => {
	it('should transpile an "If/Then...End If" statement', () => {
		const vbs = `If EnableBallControl = 1 Then\nEnableBallControl = 0\nEnd If`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`if (${Transformer.VBSHELPER_NAME}.equals(EnableBallControl, 1)) {\n    EnableBallControl = 0;\n}`,
		)
	})

	it('should transpile an inline "If/Then...End If" statement', () => {
		const vbs = `If EnableBallControl = 1 Then EnableBallControl = 0 End If`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`if (${Transformer.VBSHELPER_NAME}.equals(EnableBallControl, 1)) {\n    EnableBallControl = 0;\n}`,
		)
	})

	it('should transpile an inline "If/Then" statement', () => {
		const vbs = `If EnableBallControl = 1 Then EnableBallControl = 0`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`if (${Transformer.VBSHELPER_NAME}.equals(EnableBallControl, 1)) {\n    EnableBallControl = 0;\n}`,
		)
	})

	it('should transpile an inline "If/Then...Else...End If" statement', () => {
		const vbs = `If EnableBallControl = 1 Then EnableBallControl = 0 Else EnableBallControl = 2 End If`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`if (${Transformer.VBSHELPER_NAME}.equals(EnableBallControl, 1)) {\n    EnableBallControl = 0;\n} else {\n    EnableBallControl = 2;\n}`,
		)
	})

	it('should transpile an inline "If/Then...Else" statement', () => {
		const vbs = `If EnableBallControl = 1 Then EnableBallControl = 0 Else EnableBallControl = 2`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`if (${Transformer.VBSHELPER_NAME}.equals(EnableBallControl, 1)) {\n    EnableBallControl = 0;\n} else {\n    EnableBallControl = 2;\n}`,
		)
	})

	it('should transpile an "If/Then...Else...End If" statement', () => {
		const vbs = `If EnableBallControl = 1 Then\nEnableBallControl = 0\nEnableBallControl = 3\nElse\nEnableBallControl = 1\nEnableBallControl = 2\nEnd If`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`if (${Transformer.VBSHELPER_NAME}.equals(EnableBallControl, 1)) {\n    EnableBallControl = 0;\n    EnableBallControl = 3;\n} else {\n    EnableBallControl = 1;\n    EnableBallControl = 2;\n}`,
		)
	})

	it('should transpile an "If/Then...ElseIf/Then...End If" statement', () => {
		const vbs = `If DayOfWeek = "MON" Then\nDay = 1\nElseIf DayOfWeek = "TUE" Then\nDay = 2\nElseIf DayOfWeek = "WED" Then\nDay=3\nEnd If`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`if (${Transformer.VBSHELPER_NAME}.equals(DayOfWeek, 'MON')) {\n    Day = 1;\n} else if (${Transformer.VBSHELPER_NAME}.equals(DayOfWeek, 'TUE')) {\n    Day = 2;\n} else if (${Transformer.VBSHELPER_NAME}.equals(DayOfWeek, 'WED')) {\n    Day = 3;\n}`,
		)
	})

	it('should transpile an "If/Then...ElseIf/Then...ElseIf/Then...Else...End If" statement', () => {
		const vbs = `If DayOfWeek = "MON" Then\nDay = 1\nElseIf DayOfWeek = "TUE" Then\nDay = 2\nElseIf DayOfWeek = "WED" Then\nDay=3\nElse\nDay = 0\nEnd If`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`if (${Transformer.VBSHELPER_NAME}.equals(DayOfWeek, 'MON')) {\n    Day = 1;\n} else if (${Transformer.VBSHELPER_NAME}.equals(DayOfWeek, 'TUE')) {\n    Day = 2;\n} else if (${Transformer.VBSHELPER_NAME}.equals(DayOfWeek, 'WED')) {\n    Day = 3;\n} else {\n    Day = 0;\n}`,
		)
	})

	it('should transpile an "If/Then" with inline "ElseIf" statements', () => {
		const vbs = `If Lampstate(130)=0 Then\nColorGradeImage="ColorGrade_off"\nElseIf LampState(130)>0 Then ColorGradeImage="ColorGrade_red"\nElseIf LampState(130)=0 Then ColorGradeImage="ColorGrade_blue":x=5\nElse\nColorGradeImage="ColorGrade_on"\nEnd If`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`if (${Transformer.VBSHELPER_NAME}.equals(Lampstate(130), 0)) {\n    ColorGradeImage = 'ColorGrade_off';\n} else if (LampState(130) > 0) {\n    ColorGradeImage = 'ColorGrade_red';\n} else if (${Transformer.VBSHELPER_NAME}.equals(LampState(130), 0)) {\n    ColorGradeImage = 'ColorGrade_blue';\n    x = 5;\n} else {\n    ColorGradeImage = 'ColorGrade_on';\n}`,
		)
	})

	it('should transpile an "If/Then" statement with a member expression that matches a keyword', () => {
		const vbs = `If Error.Number<>0 Then UltraDMD=Null:Exit Function`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`if (!${Transformer.VBSHELPER_NAME}.equals(Error.Number, 0)) {\n    UltraDMD = Null;\n    return;\n}`,
		)
	})

	it('should transpile an empty "Select Case...End Select" statement', () => {
		const vbs = `Select Case day\nEnd Select`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('switch (day) {\n}')
	})

	it('should transpile a "Select Case...End Select" statement', () => {
		const vbs = `Select Case text\nCase "Sunday"\nday=0\nCase "Monday"\nday=1\nCase "Tuesday"\nday=2\nCase "Wednesday"\nday=3\nEnd Select`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			"switch (text) {\ncase 'Sunday':\n    day = 0;\n    break;\ncase 'Monday':\n    day = 1;\n    break;\ncase 'Tuesday':\n    day = 2;\n    break;\ncase 'Wednesday':\n    day = 3;\n    break;\n}",
		)
	})

	it('should transpile an empty "Select Case...Case...End Select" statement', () => {
		const vbs = `Select Case day\nCase "Sunday"\nEnd Select`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal("switch (day) {\ncase 'Sunday':\n    break;\n}")
	})

	it('should transpile a "Select Case/Case...End Select" statement', () => {
		const vbs = `Select Case text\nCase "Saturday", "Sunday"\nweekend=1\nCase "Monday"\nweekend=0\nEnd Select`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			"switch (text) {\ncase 'Saturday':\ncase 'Sunday':\n    weekend = 1;\n    break;\ncase 'Monday':\n    weekend = 0;\n    break;\n}",
		)
	})

	it('should transpile a "Select Case/Case...Else...End Select" statement', () => {
		const vbs = `Select Case text\nCase "Saturday", "Sunday"\nweekend=1\nCase Else\nweekend=0\nEnd Select`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			"switch (text) {\ncase 'Saturday':\ncase 'Sunday':\n    weekend = 1;\n    break;\ndefault:\n    weekend = 0;\n}",
		)
	})

	it('should transpile a "Select Case/Case...Else...End Select" statement with inline cases', () => {
		const vbs = `Select Case text\nCase "Saturday", "Sunday" weekend=1\nCase Else weekend=0\nEnd Select`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			"switch (text) {\ncase 'Saturday':\ncase 'Sunday':\n    weekend = 1;\n    break;\ndefault:\n    weekend = 0;\n}",
		)
	})
})
