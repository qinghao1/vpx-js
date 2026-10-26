// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { ScriptHelper } from '../../../test/script.helper'
import { TableBuilder } from '../../../test/table-builder.js'
import { Player } from '../../game/player.js'
import { Transpiler } from '../transpiler.js'
import { DATE_LITERAL_PLACEHOLDER, DateLiteralTransformer } from './date-literal-transformer.js'
import { ScopeTransformer } from './scope-transformer.js'
import { Transformer } from './transformer.js'

chai.use((sinonChai as any).default ?? sinonChai)

describe('The scripting date literal transformer', () => {
	it('should rewrite a scope-wrapped placeholder to a real Date', () => {
		const vbs = `x = #1/2/2024#\n`
		const js = transform(vbs)
		expect(js).to.equal(`${Transformer.SCOPE_NAME}.x = new Date('1/2/2024');`)
		expect(js).to.not.contain(DATE_LITERAL_PLACEHOLDER)
	})

	it('should leave user classes alone', () => {
		const vbs = `Set x = New Foo\n`
		const js = transform(vbs)
		expect(js).to.equal(`${Transformer.SCOPE_NAME}.x = new ${Transformer.SCOPE_NAME}.Foo();`)
	})

	it('should leave a user variable named Date alone', () => {
		const table = new TableBuilder().build()
		const js = new Transpiler(table, new Player(table)).transpile(`Dim Date\nDate = 5\n`)
		expect(js).to.equal(`${Transformer.SCOPE_NAME}.Date = null;\n${Transformer.SCOPE_NAME}.Date = 5;`)
	})

	it('should produce a working Date through the full pipeline', () => {
		const table = new TableBuilder().build()
		const scope = {} as any
		new Transpiler(table, new Player(table)).execute(`x = #1/2/2024#`, scope, 'global')
		expect(scope.x).to.be.an.instanceof(Date)
	})
})

function transform(vbs: string): string {
	const scriptHelper = new ScriptHelper()
	let ast = scriptHelper.vbsToAst(vbs)
	ast = new ScopeTransformer(ast).transform()
	ast = new DateLiteralTransformer(ast).transform()
	return scriptHelper.astToJs(ast)
}
