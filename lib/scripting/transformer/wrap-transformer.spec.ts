// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { ScriptHelper } from '../../../test/script.helper'
import { TableBuilder } from '../../../test/table-builder.js'
import type { Table } from '../../vpt/table/table.js'
import { ReferenceTransformer } from './reference-transformer.js'
import { WrapTransformer } from './wrap-transformer.js'

chai.use((sinonChai as any).default ?? sinonChai)

describe('The scripting wrap transformer', () => {
	// NOTE: transform() below ignores the table; a bare TableBuilder table
	// is enough — no need to parse a real .vpx fixture for this test.
	let table: Table

	before(async () => {
		table = new TableBuilder().build()
	})

	it('should wrap everything into a function', () => {
		const vbs = `Dim test\n`
		const js = transform(vbs, 'tableScript', table)
		expect(js).to.equal(
			`window.tableScript = (${ReferenceTransformer.SCOPE_NAME}, ${ReferenceTransformer.ITEMS_NAME}, ${ReferenceTransformer.ENUMS_NAME}, ${ReferenceTransformer.GLOBAL_NAME}, ${ReferenceTransformer.STDLIB_NAME}, ${ReferenceTransformer.VBSHELPER_NAME}, ${ReferenceTransformer.PLAYER_NAME}) => {\n    var test;\n};`,
		)
	})
})

function transform(vbs: string, fctName: string, _table: Table): string {
	const scriptHelper = new ScriptHelper()
	const ast = scriptHelper.vbsToAst(vbs)
	const scriptTransformer = new WrapTransformer(ast)
	const eventAst = scriptTransformer.transform(fctName, 'window')
	return scriptHelper.astToJs(eventAst)
}
