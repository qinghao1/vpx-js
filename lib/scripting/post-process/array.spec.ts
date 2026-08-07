// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import { Grammar } from '../grammar/grammar.js'
import { Transformer } from '../transformer/transformer.js'

let grammar: Grammar

before(async () => {
	grammar = new Grammar()
})

describe('The VBScript transpiler - Array', () => {
	it('should transpile a one-dimension redim', () => {
		const vbs = `Redim myarray(2)`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(`myarray = ${Transformer.VBSHELPER_NAME}.redim(myarray, [2]);`)
	})

	it('should transpile a one-dimension redim with preserve', () => {
		const vbs = `Redim Preserve myarray(2)`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(`myarray = ${Transformer.VBSHELPER_NAME}.redim(myarray, [2], true);`)
	})

	it('should transpile a multi-dimension redim', () => {
		const vbs = `Redim myarray(2,4,3)`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(`myarray = ${Transformer.VBSHELPER_NAME}.redim(myarray, [\n    2,\n    4,\n    3\n]);`)
	})

	it('should transpile a multi-dimension redim with preserve', () => {
		const vbs = `Redim Preserve myarray(2,4,3)`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(`myarray = ${Transformer.VBSHELPER_NAME}.redim(myarray, [\n    2,\n    4,\n    3\n], true);`)
	})

	it('should transpile a redim with multiple arrays', () => {
		const vbs = `Redim myarray(2,4,3), myarray2(100)`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`myarray = ${Transformer.VBSHELPER_NAME}.redim(myarray, [\n    2,\n    4,\n    3\n]);\nmyarray2 = ${Transformer.VBSHELPER_NAME}.redim(myarray2, [100]);`,
		)
	})

	it('should transpile a redim with multiple arrays and preserve', () => {
		const vbs = `Redim Preserve myarray(2,4,3), myarray2(100)`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`myarray = ${Transformer.VBSHELPER_NAME}.redim(myarray, [\n    2,\n    4,\n    3\n], true);\nmyarray2 = ${Transformer.VBSHELPER_NAME}.redim(myarray2, [100], true);`,
		)
	})

	it('should transpile an erase with a single array', () => {
		const vbs = `Erase myarray`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(`myarray = ${Transformer.VBSHELPER_NAME}.erase(myarray);`)
	})

	it('should transpile an erase with multiple arrays', () => {
		const vbs = `Erase myarray, myarray2`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`myarray = ${Transformer.VBSHELPER_NAME}.erase(myarray);\nmyarray2 = ${Transformer.VBSHELPER_NAME}.erase(myarray2);`,
		)
	})
})
