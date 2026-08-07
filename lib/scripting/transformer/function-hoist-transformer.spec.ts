// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { ScriptHelper } from '../../../test/script.helper'
import { TableBuilder } from '../../../test/table-builder.js'
import { Player } from '../../game/player.js'
import type { Table } from '../../vpt/table/table.js'
import { FunctionHoistTransformer } from './function-hoist-transformer.js'

chai.use((sinonChai as any).default ?? sinonChai)

describe('The scripting function hoist transformer', () => {
	let table: Table
	let player: Player

	beforeEach(() => {
		table = new TableBuilder().build()
		player = new Player(table)
	})

	it('should move a function to the top', () => {
		const vbs = `test\nsub test\nend sub`
		const js = transform(vbs)
		expect(js).to.equal(`function test() {\n}\ntest();`)
	})
})

function transform(vbs: string): string {
	const scriptHelper = new ScriptHelper()
	const ast = scriptHelper.vbsToAst(vbs)
	const eventAst = new FunctionHoistTransformer(ast).transform()
	return scriptHelper.astToVbs(eventAst)
}
