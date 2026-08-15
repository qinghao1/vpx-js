// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { ScriptHelper } from '../../../test/script.helper'
import { TableBuilder } from '../../../test/table-builder.js'
import { Player } from '../../game/player.js'
import { Transpiler } from '../transpiler.js'
import { ScopeTransformer } from './scope-transformer.js'
import { Transformer } from './transformer.js'

chai.use((sinonChai as any).default ?? sinonChai)

describe('The scripting scope transformer', () => {
	const table = new TableBuilder().addFlipper('Flipper').build('Table1')
	const player = new Player(table)
	const transpiler = new Transpiler(table, player)

	it('should add the scope to a top-level variable declaration', () => {
		const vbs = `Dim x\n`
		const js = transform(vbs)
		expect(js).to.equal(`${Transformer.SCOPE_NAME}.x = null;`)
	})

	it('should add the scope even if there is a defined function with a different scope', () => {
		const vbs = `Dim Ballsize\nSub Table1_Init\nEnd Sub\n`
		const js = transpiler.transpile(vbs)
		expect(js).to.equal(
			`${Transformer.ITEMS_NAME}.Table1.on('Init', function () {\n});\n${Transformer.SCOPE_NAME}.Ballsize = null;`,
		)
	})

	it('should add the scope to a top-level variable assignment', () => {
		const vbs = `x = 10\n`
		const js = transform(vbs)
		expect(js).to.equal(`${Transformer.SCOPE_NAME}.x = 10;`)
	})

	it('should add the scope to a member assignment', () => {
		const vbs = `obj.prop = 10\n`
		const js = transform(vbs)
		expect(js).to.equal(`${Transformer.SCOPE_NAME}.obj.prop = 10;`)
	})

	it('should add the scope to a member function call', () => {
		const vbs = `obj.prop.func\n`
		const js = transform(vbs)
		expect(js).to.equal(`${Transformer.SCOPE_NAME}.obj.prop.func();`)
	})

	it('should add the scope to a function call', () => {
		const vbs = `func\n`
		const js = transform(vbs)
		expect(js).to.equal(`${Transformer.SCOPE_NAME}.func();`)
	})

	it('should add the scope to a function call', () => {
		const vbs = `BallShadow(b).visible = 0\n`
		const js = transform(vbs)
		expect(js).to.equal(`${Transformer.SCOPE_NAME}.BallShadow(${Transformer.SCOPE_NAME}.b).visible = 0;`)
	})

	it('should add the scope to a member prop in a loop call', () => {
		const vbs = `For each xx in GI:xx.State = 1: Next\n`
		const js = transform(vbs)
		expect(js).to.equal(
			`for (${Transformer.SCOPE_NAME}.xx of ${Transformer.VBSHELPER_NAME}.toIterable(${Transformer.SCOPE_NAME}.GI)) {\n    ${Transformer.SCOPE_NAME}.xx.State = 1;\n}`,
		)
	})

	it('should change a function declaration to an expression', () => {
		const vbs = `Sub Foo\nEnd Sub`
		const js = transform(vbs)
		expect(js).to.equal(`${Transformer.SCOPE_NAME}.Foo = function () {\n};`)
	})

	it('should change a class declaration to an expression', () => {
		const vbs = `Class Foo\nEnd Class`
		const js = transform(vbs)
		expect(js).to.equal(`${Transformer.SCOPE_NAME}.Foo = class {\n    constructor() {\n    }\n};`)
	})

	it('should not the scope to a member call in a function', () => {
		const vbs = `Function AudioPan(tableobj)\nDim tmp\ntmp = tableobj.x * 2 / table1.width-1\nEnd Function`
		const js = transform(vbs)
		expect(js).to.equal(
			`${Transformer.SCOPE_NAME}.AudioPan = function (tableobj) {\n    let AudioPan = undefined;\n    let tmp;\n    tmp = tableobj.x * 2 / ${Transformer.SCOPE_NAME}.table1.width - 1;\n    return AudioPan;\n};`,
		)
	})

	it('should not add the scope to a function-level variable assignment', () => {
		const vbs = `Sub X\n	Dim x\nEnd Sub`
		const js = transform(vbs)
		expect(js).to.equal(`${Transformer.SCOPE_NAME}.X = function () {\n    let x;\n};`)
	})

	it('should reference the stdlib when used in a class', () => {
		const vbs = `Class cvpmDictionary\nPrivate mDict\nPrivate Sub Class_Initialize : Set mDict = CreateObject("Scripting.Dictionary") : End Sub\nEnd Class\n`
		const js = transpiler.transpile(vbs)
		expect(js).to.equal(
			`${Transformer.SCOPE_NAME}.cvpmDictionary = class {\n    constructor() {\n        this.mdict = undefined;\n        this.mdict = ${Transformer.STDLIB_NAME}.CreateObject('Scripting.Dictionary', ${Transformer.PLAYER_NAME});\n        return new Proxy(this, {\n            get: (t, p, r) => Reflect.get(t, typeof p === 'string' ? p.toLowerCase() : p, r),\n            set: (t, p, v, r) => Reflect.set(t, typeof p === 'string' ? p.toLowerCase() : p, v, r),\n            has: (t, p) => Reflect.has(t, typeof p === 'string' ? p.toLowerCase() : p)\n        });\n    }\n};`,
		)
	})
})

function transform(vbs: string): string {
	const scriptHelper = new ScriptHelper()
	let ast = scriptHelper.vbsToAst(vbs)
	ast = new ScopeTransformer(ast).transform()
	return scriptHelper.astToVbs(ast)
}
