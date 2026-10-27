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

describe('The VBScript transpiler - Error', () => {
	const cases: Array<[string, string]> = [
		[
			'an On Error Resume Next statement',
			'On Error Resume Next',
			`${Transformer.VBSHELPER_NAME}.onErrorResumeNext();`,
		],
		[
			'an On Error Resume Next statement in upper case',
			'On Error RESUME NEXT',
			`${Transformer.VBSHELPER_NAME}.onErrorResumeNext();`,
		],
		['an On Error GoTo statement', 'On Error Goto 0', `${Transformer.VBSHELPER_NAME}.onErrorGoto();`],
		['an On Error GoTo statement in upper case', 'On Error GOTO 0', `${Transformer.VBSHELPER_NAME}.onErrorGoto();`],
	]
	for (const [name, vbs, expected] of cases) {
		it(`should transpile ${name}`, () => {
			expect(grammar.vbsToJs(vbs)).to.equal(expected)
		})
	}
})

describe('The VBScript transpiler - Error behavior', () => {
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

	it('should resume and expose Err.Number', () => {
		expect(execute('On Error Resume Next\nErr.Raise 513, "test", "boom"\nx = Err.Number\nErr.Clear').x).to.equal(
			513,
		)
	})

	it('should re-arm throwing after On Error Goto 0', () => {
		expect(() => execute('On Error Resume Next\nOn Error Goto 0\nErr.Raise 513, "test", "boom"\n')).to.throw()
	})
})
