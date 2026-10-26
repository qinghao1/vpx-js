// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { ScriptHelper } from '../../../test/script.helper'
import { expressionStatement, identifier, literal, program, switchCase, switchStatement } from '../estree.js'
import { ErrorTransformer } from './error-transformer.js'

chai.use((sinonChai as any).default ?? sinonChai)

describe('The scripting error transformer', () => {
	it('should update Err when used in an "If" statement', () => {
		const vbs = `If Err Then MsgBox "Can't start Game" & cGameName & vbNewLine & Err.Description:Exit Sub`
		const js = transform(vbs)
		expect(js).to.equal(
			`if (Err.Number) {\n    MsgBox(__stdlib.CStr('Can\\'t start Game') + __stdlib.CStr(cGameName) + __stdlib.CStr(vbNewLine) + __stdlib.CStr(Err.Description));\n    return;\n}`,
		)
	})

	it('should leave Err to runtime coercion in a logical expression', () => {
		// No Err.Number rewrite here: __vbs.or coerces Err via valueOf, which reads Err.Number.
		const vbs = `If aSw = 0 Or Err Then x = 5 End If`
		const js = transform(vbs)
		expect(js).to.equal(`if (__vbs.or(__vbs.equals(aSw, 0), Err)) {\n    x = 5;\n}`)
	})

	it('should update Err when used in a "While" test', () => {
		const vbs = `While Err\nx = 1\nWend`
		const js = transform(vbs)
		expect(js).to.equal(`__exitDo:\n    while (Err.Number) {\n        x = 1;\n    }`)
	})

	it('should update Err when used in a "Do While" test', () => {
		const vbs = `Do While Err\nx = 1\nLoop`
		const js = transform(vbs)
		expect(js).to.equal(`__exitDo:\n    while (Err.Number) {\n        x = 1;\n    }`)
	})

	it('should update Err when used in a "Loop While" test', () => {
		const vbs = `Do\nx = 1\nLoop While Err`
		const js = transform(vbs)
		expect(js).to.equal(`__exitDo:\n    do {\n        x = 1;\n    } while (Err.Number);`)
	})

	it('should leave "Select Case Err" to temp coercion', () => {
		// Select Case compiles to an if/else chain reading the discriminant into
		// a temp, where valueOf coercion applies (`__vbs.equals` reads Err.Number).
		const vbs = `Select Case Err\nCase 0\nx = 1\nEnd Select`
		const js = transform(vbs)
		expect(js).to.contain('let __vbsSelect = Err;')
	})

	it('should update Err when used as a switch discriminant', () => {
		const ast = program([
			switchStatement(identifier('Err'), [switchCase(literal(0), [expressionStatement(identifier('x'))])]),
		])
		const js = new ScriptHelper().astToJs(new ErrorTransformer(ast).transform())
		expect(js).to.equal('switch (Err.Number) {\ncase 0:\n    x;\n}')
	})
})

function transform(vbs: string): string {
	const scriptHelper = new ScriptHelper()
	let ast = scriptHelper.vbsToAst(vbs)
	ast = new ErrorTransformer(ast).transform()
	return scriptHelper.astToJs(ast)
}
