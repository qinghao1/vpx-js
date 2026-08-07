// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { getTextFile } from '../vbs-scripts.node.js'
import { Grammar } from './grammar.js'

chai.use((sinonChai as any).default ?? sinonChai)

let grammar: Grammar

before(async () => {
	grammar = new Grammar()
})

describe('The scripting grammar - format', () => {
	it('should remove whitespace', () => {
		const vbs = `Dim   x`
		const js = grammar.format(vbs)
		expect(js).to.equal(`Dim x\n`)
	})

	it('should remove comments', () => {
		const vbs = `Dim   x ' Test comment`
		const js = grammar.format(vbs)
		expect(js).to.equal(`Dim x\n`)
	})

	it('should standardize keywords', () => {
		const vbs = `ReDiM x(2) : DiM x2`
		const js = grammar.format(vbs)
		expect(js).to.equal(`ReDim x(2):Dim x2\n`)
	})

	it('should join line continuation', () => {
		const vbs = `x = x +_\n5`
		const js = grammar.format(vbs)
		expect(js).to.equal(`x=x+5\n`)
	})

	it('should remove blank lines', () => {
		const vbs = `x = x + 5\n\n\nx = x + 10\n\n\n`
		const js = grammar.format(vbs)
		expect(js).to.equal(`x=x+5\nx=x+10\n`)
	})
})

describe('The scripting grammar - transpile', () => {
	it('should throw an exception for an empty script', () => {
		const vbs = ``
		expect(() => grammar.transpile(vbs)).to.throw(Error)
	})

	it('should throw an exception for invalid syntax', () => {
		const vbs = `test()\ntest2\ntest3() 1,2\n`
		expect(() => grammar.transpile(vbs)).to.throw(Error)
	})

	it('should allow lines to end with a ":" statement terminator', () => {
		const vbs = `SLLPos=0:Me.TimerEnabled=1:\n`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(`SLLPos = 0;\nthis.TimerEnabled = 1;`)
	})

	// it('should transpile controller.vbs successfully', () => {
	// 	const vbs = getTextFile('controller.vbs');
	// 	expect(() => grammar.transpile(vbs)).not.to.throw(Error);
	// });
	//
	// it('should transpile core.vbs successfully', () => {
	// 	const vbs = getTextFile('core.vbs');
	// 	expect(() => grammar.transpile(vbs)).not.to.throw(Error);
	// });
})
