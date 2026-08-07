// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import * as sinon from 'sinon'
import sinonChai from 'sinon-chai'
import { TableBuilder } from '../../test/table-builder.js'
import { Player } from '../game/player.js'
import type { Table } from '../vpt/table/table.js'
import { Transformer } from './transformer/transformer.js'
import { Transpiler } from './transpiler.js'

chai.use((sinonChai as any).default ?? sinonChai)

describe('The VBScript transpiler', () => {
	let table: Table
	let player: Player

	before(async () => {
		table = new TableBuilder().addFlipper('Flipper').build()
		player = new Player(table)
	})

	it('should wrap everything into a global function', () => {
		const vbs = `Dim test\n`
		const transpiler = new Transpiler(table, player)
		const js = transpiler.transpile(vbs, 'runTableScript')
		expect(js).to.equal(
			`runTableScript = (${Transformer.SCOPE_NAME}, ${Transformer.ITEMS_NAME}, ${Transformer.ENUMS_NAME}, ${Transformer.GLOBAL_NAME}, ${Transformer.STDLIB_NAME}, ${Transformer.VBSHELPER_NAME}, ${Transformer.PLAYER_NAME}) => {\n        __scope.test = null;\n};`,
		)
	})

	it('should wrap everything into a function of an object', () => {
		const vbs = `Dim test\n`
		const transpiler = new Transpiler(table, player)
		const js = transpiler.transpile(vbs, 'runTableScript', 'window')
		expect(js).to.equal(
			`window.runTableScript = (${Transformer.SCOPE_NAME}, ${Transformer.ITEMS_NAME}, ${Transformer.ENUMS_NAME}, ${Transformer.GLOBAL_NAME}, ${Transformer.STDLIB_NAME}, ${Transformer.VBSHELPER_NAME}, ${Transformer.PLAYER_NAME}) => {\n        __scope.test = null;\n};`,
		)
	})

	it('should execute the table script', () => {
		const Spy = sinon.spy()
		const vbs = `Spy\n` // that's our spy, in VBScript!
		const transpiler = new Transpiler(table, player)
		transpiler.execute(vbs, { Spy }, 'global') // this should execute the spy

		expect(Spy).to.have.been.calledOnce
	})

	it('should handle case insensitivity when reading global variables', () => {
		const scope = {} as any
		const vbs = `MyVariable = 10\nValueRead = mYvArIAblE`
		const transpiler = new Transpiler(table, player)
		transpiler.execute(vbs, scope, 'global')

		expect(scope.ValueRead).to.equal(10)
	})

	it('should handle case insensitivity when writing global variables', () => {
		const scope = {} as any
		const vbs = `MyVariable = 10\nmYvArIAblE = 12`
		const transpiler = new Transpiler(table, player)
		transpiler.execute(vbs, scope, 'global')

		expect(scope.MyVariable).to.equal(12)
	})

	it('should handle case insensitivity when calling functions', () => {
		const scope = {} as any
		const vbs = `Sub Abc\nMyVariable = 13\nEnd Sub\naBC`
		const transpiler = new Transpiler(table, player)
		transpiler.execute(vbs, scope, 'global')

		expect(scope.MyVariable).to.equal(13)
	})
})
