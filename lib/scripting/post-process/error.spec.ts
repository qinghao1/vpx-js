// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import { Grammar } from '../grammar/grammar.js'
import { Transformer } from '../transformer/transformer.js'

let grammar: Grammar

before(async () => {
	grammar = new Grammar()
})

describe('The VBScript transpiler - Error', () => {
	it('should transpile an On Error Resume Next statement', () => {
		const vbs = `On Error Resume Next`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(`${Transformer.VBSHELPER_NAME}.onErrorResumeNext();`)
	})
})

describe('The VBScript transpiler - Error', () => {
	it('should transpile an On Error GoTo statement', () => {
		const vbs = `On Error Goto 0`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(`${Transformer.VBSHELPER_NAME}.onErrorGoto(0);`)
	})
})
