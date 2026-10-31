// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import { Grammar } from '../grammar/grammar.js'
import { Transformer } from '../transformer/transformer.js'

let grammar: Grammar

before(async () => {
	grammar = new Grammar()
})

describe('The VBScript transpiler - Variable Declaration', () => {
	it('should transpile a single variable declaration', () => {
		const vbs = `Dim test1`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('var test1;')
	})

	it('should transpile a multiple variable declaration', () => {
		const vbs = `Dim test1, test2, test3`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('var test1, test2, test3;')
	})

	it('should transpile an empty dimension variable declaration', () => {
		const vbs = `Dim myarray()`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(`var myarray = ${Transformer.VBSHELPER_NAME}.dim([]);`)
	})

	it('should transpile a one-dimension variable declaration', () => {
		const vbs = `Dim myarray(200)`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(`var myarray = ${Transformer.VBSHELPER_NAME}.dim([200]);`)
	})

	it('should transpile a multi-dimension variable declaration', () => {
		const vbs = `Dim myarray(2,4,3)`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(`var myarray = ${Transformer.VBSHELPER_NAME}.dim([\n    2,\n    4,\n    3\n]);`)
	})

	it('should transpile multiple multi-dimension variable declaration', () => {
		const vbs = `Dim myarray(2,4,3), myarray2(3,4)`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`var myarray = ${Transformer.VBSHELPER_NAME}.dim([\n        2,\n        4,\n        3\n    ]), myarray2 = ${Transformer.VBSHELPER_NAME}.dim([\n        3,\n        4\n    ]);`,
		)
	})

	it('should transpile a public variable declaration', () => {
		const vbs = `Public test1`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('var test1;')
	})

	it('should transpile multiple public variable declarations', () => {
		const vbs = `public test1, test2`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('var test1, test2;')
	})

	it('should transpile a public multi-dimension variable declaration', () => {
		const vbs = `public test(100, 200)`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(`var test = ${Transformer.VBSHELPER_NAME}.dim([\n    100,\n    200\n]);`)
	})

	it('should transpile a single private variable declaration', () => {
		const vbs = `Private test1`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('var test1;')
	})

	it('should hoist a block-level declaration to procedure scope', () => {
		const vbs = `Sub Foo()\n\tIf False Then\n\t\tDim VelCoef\n\t\tVelCoef = 1\n\tEnd If\n\tBar VelCoef\nEnd Sub`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.contain('var VelCoef;')
		expect(js).to.not.contain('let VelCoef;')
	})

	it('should hoist a loop-level declaration to procedure scope', () => {
		const vbs = `Sub Foo()\n\tFor x = 0 To 3\n\t\tDim total\n\t\ttotal = x\n\tNext\n\tBar total\nEnd Sub`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.contain('var total;')
		expect(js).to.not.contain('let total;')
	})

	it('should transpile multiple private variable declarations', () => {
		const vbs = `Private test1, test2`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('var test1, test2;')
	})
})
