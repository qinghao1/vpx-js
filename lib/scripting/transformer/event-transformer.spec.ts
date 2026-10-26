// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { ScriptHelper } from '../../../test/script.helper'
import { TableBuilder } from '../../../test/table-builder.js'
import { ThreeHelper } from '../../../test/three.helper'
import { Player } from '../../game/player.js'
import type { Table } from '../../vpt/table/table.js'
import { Transpiler } from '../transpiler.js'
import { EventTransformer } from './event-transformer.js'

chai.use((sinonChai as any).default ?? sinonChai)

describe('The scripting event transformer', () => {
	const _three = new ThreeHelper()
	let table: Table

	before(() => {
		table = new TableBuilder().addGate('WireRectangle').addGate('Wire_Rectangle').build()
	})

	it('should transform a valid event on a valid item', () => {
		const vbs = `Sub WireRectangle_Init()\nBallRelease.CreateBall\nEnd Sub\n`
		const js = transform(vbs, table)
		expect(js).to.equal(
			`WireRectangle.on('Init', WireRectangle_Init = function () {\n    BallRelease.CreateBall();\n});`,
		)
	})

	it('should transform a an item with an underscore in its name', () => {
		const vbs = `Sub Wire_Rectangle_Init()\nBallRelease.CreateBall\nEnd Sub\n`
		const js = transform(vbs, table)
		expect(js).to.equal(
			`Wire_Rectangle.on('Init', Wire_Rectangle_Init = function () {\n    BallRelease.CreateBall();\n});`,
		)
	})

	it('should transform when the event name has a different case', () => {
		const vbs = `Sub WireRectangle_init()\nBallRelease.CreateBall\nEnd Sub\n`
		const js = transform(vbs, table)
		expect(js).to.equal(
			`WireRectangle.on('Init', WireRectangle_init = function () {\n    BallRelease.CreateBall();\n});`,
		)
	})

	it('should not transform an invalid event on a valid item', () => {
		const vbs = `Sub WireRectangle_DuhDah()\nBallRelease.CreateBall\nEnd Sub\n`
		const js = transform(vbs, table)
		expect(js).to.equal(`function WireRectangle_DuhDah() {\n    BallRelease.CreateBall();\n}`)
	})

	it('should not transform a valid event on an invalid item', () => {
		const vbs = `Sub DoesntExist_Init()\nBallRelease.CreateBall\nEnd Sub\n`
		const js = transform(vbs, table)
		expect(js).to.equal(`function DoesntExist_Init() {\n    BallRelease.CreateBall();\n}`)
	})

	it('should not transform a non-event sub', () => {
		const vbs = `Sub MySub()\nBallRelease.CreateBall\nEnd Sub\n`
		const js = transform(vbs, table)
		expect(js).to.equal(`function MySub() {\n    BallRelease.CreateBall();\n}`)
	})

	it('should keep the handler callable by a manual call', () => {
		const vbs = `Sub WireRectangle_Init()\nx = 1\nEnd Sub\nWireRectangle_Init()\n`
		const js = transform(vbs, table)
		expect(js).to.contain(`WireRectangle_Init = function`)
		expect(js).to.contain(`WireRectangle_Init();`)
	})
})

describe('The scripting event transformer - behavior', () => {
	it('should run the handler body on a manual call', () => {
		const table = new TableBuilder().addGate('WireRectangle').build()
		const scope = {} as any
		new Transpiler(table, new Player(table)).execute(
			`Sub WireRectangle_Init()\nx = 42\nEnd Sub\nWireRectangle_Init()`,
			scope,
			'global',
		)
		expect(scope.x).to.equal(42)
	})

	it('should still register the event listener', () => {
		const table = new TableBuilder().addGate('WireRectangle').build()
		const js = new Transpiler(table, new Player(table)).transpile(`Sub WireRectangle_Init()\nx = 1\nEnd Sub\n`)
		expect(js).to.contain(`.on('Init'`)
	})
})

function transform(vbs: string, table: Table): string {
	const scriptHelper = new ScriptHelper()
	const ast = scriptHelper.vbsToAst(vbs)
	const eventTransformer = new EventTransformer(ast, table.getElements())
	const eventAst = eventTransformer.transform()
	return scriptHelper.astToJs(eventAst)
}
