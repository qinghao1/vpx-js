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
		expect(js).to.equal(
			`myarray = ${Transformer.VBSHELPER_NAME}.redim(myarray, [\n    2,\n    4,\n    3\n], true);`,
		)
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

describe('The VBScript transpiler - Array behavior', () => {
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

	it('should reshape and clear without Preserve', () => {
		const scope = execute('Dim a(2)\na(0) = "x"\nReDim a(5)\nn = UBound(a)\ne = IsEmpty(a(0))')
		expect(scope.n).to.equal(5)
		expect(scope.e).to.equal(true)
	})
})
