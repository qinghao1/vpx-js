// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { readFileSync } from 'node:fs'
import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { TableBuilder } from '../../../test/table-builder.js'
import { Player } from '../../game/player.js'
import { getTextFile } from '../../scripting/vbs-scripts.node.js'
import type { Table } from '../../vpt/table/table.js'
import { Transformer } from '../transformer/transformer.js'
import { Transpiler } from '../transpiler.js'
import { Grammar } from './grammar.js'

chai.use((sinonChai as any).default ?? sinonChai)

let grammar: Grammar
let table: Table
let player: Player

before(async () => {
	grammar = new Grammar()
	table = new TableBuilder().addFlipper('Flipper').build()
	player = new Player(table)
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
	it('should transpile an empty script to an empty program', () => {
		for (const vbs of [``, `   \n`, `' just a comment\n`, `Rem just a comment\n`]) {
			expect(grammar.transpile(vbs).body, JSON.stringify(vbs)).to.deep.equal([])
		}
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
})

describe('The scripting grammar - real-world scripts', () => {
	it('should transpile bundled scripts', () => {
		const names = ['controller.vbs', 'core.vbs', 'sam.vbs', 'WPC.vbs', 'VPMKeys.vbs']
		for (const n of names) {
			let vbs: string
			try {
				vbs = getTextFile(n)
			} catch {
				continue
			}
			expect(() => grammar.transpile(vbs)).not.to.throw(Error, n)
		}
	})
})

describe('The scripting grammar - block Else If (two words)', () => {
	it('should transpile a block "If/Then...Else If/Then...End If" statement', () => {
		const vbs = `If x = 1 Then\ny = 1\nElse If x = 2 Then\ny = 2\nEnd If`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`if (${Transformer.VBSHELPER_NAME}.equals(x, 1)) {\n    y = 1;\n} else if (${Transformer.VBSHELPER_NAME}.equals(x, 2)) {\n    y = 2;\n}`,
		)
	})

	it('should transpile two-word "Else If" with mixed case and extra spaces', () => {
		const vbs = `If x = 1 Then\ny = 1\nelse  If x = 2 Then\ny = 2\nElse\ny = 3\nEnd If`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`if (${Transformer.VBSHELPER_NAME}.equals(x, 1)) {\n    y = 1;\n} else if (${Transformer.VBSHELPER_NAME}.equals(x, 2)) {\n    y = 2;\n} else {\n    y = 3;\n}`,
		)
	})

	it('should transpile chained two-word "Else If" with inline statements', () => {
		const vbs = `If x = 1 Then\ny = 1\nElse If x = 2 Then y = 2\nElse If x = 3 Then\ny = 3\nEnd If`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`if (${Transformer.VBSHELPER_NAME}.equals(x, 1)) {\n    y = 1;\n} else if (${Transformer.VBSHELPER_NAME}.equals(x, 2)) {\n    y = 2;\n} else if (${Transformer.VBSHELPER_NAME}.equals(x, 3)) {\n    y = 3;\n}`,
		)
	})

	it('should execute the matching two-word "Else If" branch', () => {
		const scope = {} as any
		const vbs = `x = 2\nIf x = 1 Then\ny = 1\nElse If x = 2 Then\ny = 2\nElse\ny = 3\nEnd If`
		new Transpiler(table, player).execute(vbs, scope, 'global')
		expect(scope.y).to.equal(2)
	})

	it('should execute "Else" when no two-word "Else If" matches', () => {
		const scope = {} as any
		const vbs = `x = 9\nIf x = 1 Then\ny = 1\nElse If x = 2 Then\ny = 2\nElse\ny = 3\nEnd If`
		new Transpiler(table, player).execute(vbs, scope, 'global')
		expect(scope.y).to.equal(3)
	})
})

describe('The scripting grammar - Call with parenthesized arguments', () => {
	it('should transpile "Call" with parenthesized args', () => {
		expect(grammar.vbsToJs(`Call Foo(1, 2)`)).to.equal('Foo(1, 2);')
	})

	it('should transpile member "Call" with parenthesized args', () => {
		expect(grammar.vbsToJs(`Call obj.Method(1, 2)`)).to.equal('obj.Method(1, 2);')
	})

	it('should transpile "Call" with nested and string args', () => {
		expect(grammar.vbsToJs(`Call Foo(Bar(1), "a(b")`)).to.equal(`Foo(Bar(1), 'a(b');`)
	})

	it('should leave single-arg parenthesized "Call" untouched', () => {
		expect(grammar.vbsToJs(`Call Foo(Bar)`)).to.equal('Foo(Bar);')
	})

	it('should keep rejecting parenthesized args without "Call"', () => {
		expect(() => grammar.transpile(`Foo(1, 2)`)).to.throw(Error)
	})

	it('should execute "Call" with parenthesized args', () => {
		const scope = {} as any
		const vbs = `Sub Foo(a, b)\nSum = a + b\nEnd Sub\nCall Foo(20, 22)`
		new Transpiler(table, player).execute(vbs, scope, 'global')
		expect(scope.Sum).to.equal(42)
	})

	it('should execute member "Call" with parenthesized args', () => {
		const scope = {
			total: 0,
			calc: {
				add: (a: number, b: number) => {
					scope.total = a + b
				},
			},
		} as any
		new Transpiler(table, player).execute(`Call calc.add(20, 22)`, scope, 'global')
		expect(scope.total).to.equal(42)
	})
})

describe('The scripting grammar - colon Rem comments', () => {
	it('should strip a ": Rem" comment', () => {
		expect(grammar.format(`x = 1 : Rem fix the lights`)).to.equal(`x=1\n`)
	})

	it('should strip ":Rem" without spaces', () => {
		expect(grammar.format(`x = 1:Rem fix`)).to.equal(`x=1\n`)
	})

	it('should not treat identifiers containing "rem" as comments', () => {
		expect(grammar.format(`x = 1 : remedy = 2`)).to.equal(`x=1:remedy=2\n`)
	})

	it('should transpile a statement followed by ": Rem" without emitting a call', () => {
		expect(grammar.vbsToJs(`x = 1 : Rem fix`)).to.equal(`x = 1;`)
		expect(grammar.vbsToJs(`x = 1 : REM fix the lights`)).to.equal(`x = 1;`)
	})

	it('should execute the statement before ": Rem"', () => {
		const scope = {} as any
		new Transpiler(table, player).execute(`Answer = 40 + 2 : Rem the answer`, scope, 'global')
		expect(scope.Answer).to.equal(42)
	})
})

describe('The scripting grammar - single-word ElseIf', () => {
	it('should execute the matching single-word "ElseIf" branch', () => {
		const scope = {} as any
		const vbs = `x = 2\nIf x = 1 Then\ny = 1\nElseIf x = 2 Then\ny = 2\nElse\ny = 3\nEnd If`
		new Transpiler(table, player).execute(vbs, scope, 'global')
		expect(scope.y).to.equal(2)
	})
})

describe('The scripting grammar - keyword fast path', () => {
	// Keywords straight from grammar.bnf, so a bnf/generator change that the
	// trie misses fails here instead of silently parsing keywords as identifiers.
	function bnfKeywords(): string[] {
		const bnf = readFileSync(new URL('./grammar.bnf', import.meta.url), 'utf8')
		const line = bnf.split('\n').find(l => l.startsWith('Keyword ::='))
		const keywords = [...(line ?? '').matchAll(/'([A-Za-z]+)'/g)].map(m => m[1]!)
		expect(keywords.length).to.be.greaterThan(50)
		return keywords
	}

	it('should reject every bnf keyword as an identifier', () => {
		for (const keyword of bnfKeywords()) {
			expect(() => grammar.transpile(`Dim ${keyword}\n`), keyword).to.throw(Error)
			expect(() => grammar.transpile(`Dim ${keyword.toLowerCase()}\n`), keyword).to.throw(Error)
		}
	})

	it('should accept keyword-prefixed and keyword-suffixed identifiers', () => {
		for (const keyword of bnfKeywords()) {
			expect(() => grammar.transpile(`Dim ${keyword}q\n`), keyword).not.to.throw(Error)
			expect(() => grammar.transpile(`Dim q${keyword}\n`), keyword).not.to.throw(Error)
			expect(() => grammar.transpile(`Dim ${keyword}1\n`), keyword).not.to.throw(Error)
		}
	})
})
