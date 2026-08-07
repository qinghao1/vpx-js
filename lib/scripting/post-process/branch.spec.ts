// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import { Grammar } from '../grammar/grammar.js'
import { Transformer } from '../transformer/transformer.js'

let grammar: Grammar

before(async () => {
	grammar = new Grammar()
})

describe('The VBScript transpiler - Branch', () => {
	it('should transpile an Exit Sub', () => {
		const vbs = `If mTimers = 0 Then x = 5 : Exit Sub`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(`if (${Transformer.VBSHELPER_NAME}.equals(mTimers, 0)) {\n    x = 5;\n    return;\n}`)
	})

	it('should transpile an Exit Function', () => {
		const vbs = `Function test(x)\nIf x = 1 Then Exit Function\nx = 5\nEnd Function`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`function test(x) {\n    let test = undefined;\n    if (${Transformer.VBSHELPER_NAME}.equals(x, 1)) {\n        return test;\n    }\n    x = 5;\n    return test;\n}`,
		)
	})

	it('should transpile an Exit For', () => {
		const vbs = `For j = 1 To 20 Step x\nIf j = 10 Then Exit For\nNext`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`for (j = 1; x < 0 ? j >= 20 : j <= 20; j += x) {\n    if (${Transformer.VBSHELPER_NAME}.equals(j, 10)) {\n        break;\n    }\n}`,
		)
	})
})
