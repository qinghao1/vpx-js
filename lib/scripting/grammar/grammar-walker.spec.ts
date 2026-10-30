// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import { vi } from 'vitest'
import { Grammar } from './grammar.js'

// In the browser, vite aliases node `assert` to an ESM shim that only has a
// `default` export. dash-ast (CJS) calls its `require('assert')` result
// directly, so the interopped namespace is not callable and every
// Grammar.transpile throws "assert is not a function" — in the transpile
// worker and in ExecuteGlobal/GetTextFile inline transpiles alike. Node never
// sees this (its builtin assert is callable), so the browser is simulated here
// by making dash-ast unusable: the grammar must not depend on it.
vi.mock('dash-ast', () => ({
	default: () => {
		throw new Error('assert is not a function')
	},
}))

describe('The scripting grammar - browser-safe tree walk', () => {
	it('should transpile without dash-ast', () => {
		const ast = new Grammar().transpile(`Dim x\nx = 1 + 2\n`)
		expect(ast.type).to.equal('Program')
		expect(ast.body).to.have.length(2)
	})

	it('should post-process nested blocks child-first without dash-ast', () => {
		const ast = new Grammar().transpile(`Dim x\nIf x = 1 Then\ny = 2\nEnd If\n`)
		expect(ast.type).to.equal('Program')
		const ifStmt = ast.body.find(node => node.type === 'IfStatement')
		expect(ifStmt).to.not.equal(undefined)
		expect(ifStmt).to.have.property('consequent')
	})
})
