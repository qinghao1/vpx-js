// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import { Grammar } from '../grammar/grammar.js'

let grammar: Grammar

before(async () => {
	grammar = new Grammar()
})

describe('The VBScript transpiler - Const', () => {
	it('should transpile a single Const declaration', () => {
		const vbs = `Const pi = 3.14`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('const pi = 3.14;')
	})

	it('should transpile a single "Private" Const declaration', () => {
		const vbs = `Private Const test = 20`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('const test = 20;')
	})

	it('should transpile a multiple Const declaration', () => {
		const vbs = `Const test1 = 3.14, test2 = 4, test3 = -5.2, test4 = True, test5 = "STRING"`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal("const test1 = 3.14, test2 = 4, test3 = -5.2, test4 = true, test5 = 'STRING';")
	})

	it('should transpile a Const declaration with literal in parenthesis', () => {
		const vbs = `Const test1 = (5)`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('const test1 = 5;')
	})
})
