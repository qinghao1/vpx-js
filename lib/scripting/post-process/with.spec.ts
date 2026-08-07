// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import { Grammar } from '../grammar/grammar.js'

let grammar: Grammar

before(async () => {
	grammar = new Grammar()
})

describe('The VBScript transpiler - With', () => {
	it('should transpile a "With...End With" statement with an assignment expression', () => {
		const vbs = `With x\n.value = 5\n.type = "TEST"\nEnd With`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal("x.value = 5;\nx.type = 'TEST';")
	})

	it('should transpile a "With...End With" statement with a call expression', () => {
		const vbs = `With Controller\nSelect Case keycode\nCase keyReset .Stop\nEnd Select\nEnd With`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('switch (keycode) {\ncase keyReset:\n    Controller.Stop();\n    break;\n}')
	})

	it('should transpile a "With...End With" statement with a unary expression', () => {
		const vbs = `With Controller\nSelect Case keycode\nCase keyFrame .LockDisplay = Not .LockDisplay\nEnd Select\nEnd With`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			'switch (keycode) {\ncase keyFrame:\n    Controller.LockDisplay = !Controller.LockDisplay;\n    break;\n}',
		)
	})
})
