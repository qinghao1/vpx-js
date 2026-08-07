// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import { Grammar } from '../grammar/grammar.js'
import { Transformer } from '../transformer/transformer.js'

let grammar: Grammar

before(async () => {
	grammar = new Grammar()
})

describe('The VBScript transpiler - Assign', () => {
	it('should transpile an assignment statement', () => {
		const vbs = `EnableBallControl = 0`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('EnableBallControl = 0;')
	})

	it('should transpile an assignment statement with function call', () => {
		const vbs = `AudioFade = Csng(-((- tmp) ^10), 20)`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(`AudioFade = Csng(-${Transformer.VBSHELPER_NAME}.exponent(-tmp, 10), 20);`)
	})

	it('should transpile a "Set" assignment statement', () => {
		const vbs = `Set EnableBallControl = 0`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('EnableBallControl = 0;')
	})

	it('should transpile a "New" object assignment statement', () => {
		const vbs = `Set vpmDips = New cvpmDips`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('vpmDips = new cvpmDips();')
	})

	it('should transpile a "New/Nothing" object assignment statement', () => {
		const vbs = `Set vpmDips = New cvpmDips Nothing`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('vpmDips = new cvpmDips();\nvpmDips = Nothing;')
	})

	it('should transpile an assignment statement with left parameters', () => {
		const vbs = `J(2,3,9,4) = X`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('J(2, 3, 9, 4) = X;')
	})

	it('should transpile an assignment statement with missing left parameters', () => {
		const vbs = `J(,1,,,4,)=X`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('J(undefined, 1, undefined, undefined, 4, undefined) = X;')
	})

	it('should transpile an assignment statement with right parameters', () => {
		const vbs = `X = J(2,3,9,4)`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('X = J(2, 3, 9, 4);')
	})

	it('should transpile an assignment statement with missing right parameters', () => {
		const vbs = `X = J(,2,,9,,4,)`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('X = J(undefined, 2, undefined, 9, undefined, 4, undefined);')
	})
})
