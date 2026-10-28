// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { ScriptHelper } from '../../../test/script.helper'
import { TableBuilder } from '../../../test/table-builder.js'
import { Player } from '../../game/player.js'
import { Enums } from '../../vpt/enums.js'
import { GlobalApi } from '../../vpt/global-api.js'
import type { Table } from '../../vpt/table/table.js'
import { Stdlib } from '../stdlib/index.js'
import { ReferenceTransformer } from './reference-transformer.js'
import { Transformer } from './transformer.js'

chai.use((sinonChai as any).default ?? sinonChai)

describe('The scripting reference transformer', () => {
	let table: Table
	let player: Player

	before(async () => {
		table = new TableBuilder().addFlipper('Flipper').build()
		player = new Player(table)
	})

	describe('for playfield items', () => {
		it('should convert global to local variable if object exists', () => {
			const vbs = `Flipper.SomeFunct\n`
			const js = transform(vbs, table, player)
			expect(js).to.equal(`${Transformer.ITEMS_NAME}.Flipper.SomeFunct();`)
		})

		it('should not use an item variable for members', () => {
			const vbs = `foo.Flipper = "bar"\n`
			const js = transform(vbs, table, player)
			expect(js).to.equal(`foo.Flipper = 'bar';`)
		})

		it('should not use an item variable for members of members', () => {
			const vbs = `foo.bar.Flipper = "toto"\n`
			const js = transform(vbs, table, player)
			expect(js).to.equal(`foo.bar.Flipper = 'toto';`)
		})

		it('should use an item variable root object name', () => {
			const vbs = `Flipper.Foo = "bar"\n`
			const js = transform(vbs, table, player)
			expect(js).to.equal(`${Transformer.ITEMS_NAME}.Flipper.Foo = 'bar';`)
		})

		it('should convert a table element to correct case', () => {
			const vbs = `fliPpeR.Length = 100\n`
			const js = transform(vbs, table, player)
			expect(js).to.equal(`${Transformer.ITEMS_NAME}.Flipper.Length = 100;`)
		})

		it('should convert a table element property to correct case', () => {
			const vbs = `Flipper.lEnGTh = 100\n`
			const js = transform(vbs, table, player)
			expect(js).to.equal(`${Transformer.ITEMS_NAME}.Flipper.Length = 100;`)
		})
	})

	describe('for enums', () => {
		it('should not convert a function into an enum', () => {
			const vbs = `TriggerShape.TriggerButton\n`
			const js = transform(vbs, table, player)
			expect(js).to.equal(`TriggerShape.TriggerButton();`)
		})

		it('should convert an enum if enum exists', () => {
			const vbs = `x = TriggerShape.TriggerButton\n`
			const js = transform(vbs, table, player)
			expect(js).to.equal(`x = ${Transformer.ENUMS_NAME}.TriggerShape.TriggerButton;`)
		})

		it('should not use an enum for members', () => {
			const vbs = `Set x = foo.TriggerShape.TriggerButton\n`
			const js = transform(vbs, table, player)
			expect(js).to.equal(`x = foo.TriggerShape.TriggerButton;`)
		})

		it('should not use an enum for members of members', () => {
			const vbs = `Set x = foo.bar.TriggerShape.TriggerButton\n`
			const js = transform(vbs, table, player)
			expect(js).to.equal(`x = foo.bar.TriggerShape.TriggerButton;`)
		})

		it('should convert an enum name to correct case', () => {
			const vbs = `x = gaTEtYPe.GateWireRectangle\n`
			const js = transform(vbs, table, player)
			expect(js).to.equal(`x = ${Transformer.ENUMS_NAME}.GateType.GateWireRectangle;`)
		})

		it('should convert an enum value to correct case', () => {
			const vbs = `x = GateType.gATeWirERecTAnGlE\n`
			const js = transform(vbs, table, player)
			expect(js).to.equal(`x = ${Transformer.ENUMS_NAME}.GateType.GateWireRectangle;`)
		})
	})

	describe('for the stdlib', () => {
		it('should convert a stdlib call to correct case', () => {
			const vbs = `x = INT(1.2)\n`
			const js = transform(vbs, table, player)
			expect(js).to.equal(`x = ${Transformer.STDLIB_NAME}.Int(1.2);`)
		})

		it('should convert a stdlib property call to correct case', () => {
			const vbs = `x = Math.PoW(12)\n`
			const js = transform(vbs, table, player)
			expect(js).to.equal(`x = ${Transformer.STDLIB_NAME}.Math.pow(12);`)
		})

		it('should not use the stdlib for members', () => {
			const vbs = `set x = vpmFlips.Math.Pi\n`
			const js = transform(vbs, table, player)
			expect(js).to.equal(`x = vpmFlips.Math.Pi;`)
		})

		it('should not use the stdlib for members of members', () => {
			const vbs = `set x = myObj.vpmFlips.Math.Pi\n`
			const js = transform(vbs, table, player)
			expect(js).to.equal(`x = myObj.vpmFlips.Math.Pi;`)
		})

		it('should use the stdlib for root object names', () => {
			const vbs = `set x = Math.Pi.Something\n`
			const js = transform(vbs, table, player)
			expect(js).to.equal(`x = ${Transformer.STDLIB_NAME}.Math.Pi.Something;`)
		})

		it('should use the stdlib for Empty literal', () => {
			const vbs = `set x = Empty\n`
			const js = transform(vbs, table, player)
			expect(js).to.equal(`x = ${Transformer.STDLIB_NAME}.Empty;`)
		})

		it('should use the stdlib for Nothing literal', () => {
			const vbs = `set x = Nothing\n`
			const js = transform(vbs, table, player)
			expect(js).to.equal(`x = ${Transformer.STDLIB_NAME}.Nothing;`)
		})

		it('should use the stdlib for Null literal', () => {
			const vbs = `set x = Null\n`
			const js = transform(vbs, table, player)
			expect(js).to.equal(`x = ${Transformer.STDLIB_NAME}.Null;`)
		})

		it('should use the stdlib for vb string constants', () => {
			const vbs = `_vbCr = vbCr\n_vbCrLf = vbCrLf\n_vbFormFeed = vbFormFeed\n_vbLf = vbLf\n_vbNewLine = vbNewLine\n_vbNullChar = vbNullChar\n_vbNullString = vbNullString\n_vbTab = vbTab\n_vbVerticalTab = vbVerticalTab\n`
			const js = transform(vbs, table, player)
			expect(js).to.equal(
				`_vbCr = ${Transformer.STDLIB_NAME}.vbCr;\n_vbCrLf = ${Transformer.STDLIB_NAME}.vbCrLf;\n_vbFormFeed = ${Transformer.STDLIB_NAME}.vbFormFeed;\n_vbLf = ${Transformer.STDLIB_NAME}.vbLf;\n_vbNewLine = ${Transformer.STDLIB_NAME}.vbNewLine;\n_vbNullChar = ${Transformer.STDLIB_NAME}.vbNullChar;\n_vbNullString = ${Transformer.STDLIB_NAME}.vbNullString;\n_vbTab = ${Transformer.STDLIB_NAME}.vbTab;\n_vbVerticalTab = ${Transformer.STDLIB_NAME}.vbVerticalTab;`,
			)
		})
	})

	describe('for the global API', () => {
		it('should convert a global function if exists', () => {
			const vbs = `PlaySound "test"\n`
			const js = transform(vbs, table, player)
			expect(js).to.equal(`${Transformer.GLOBAL_NAME}.PlaySound('test');`)
		})

		it('should convert a global function to correct case', () => {
			const vbs = `plaYSoUND "test"\n`
			const js = transform(vbs, table, player)
			expect(js).to.equal(`${Transformer.GLOBAL_NAME}.PlaySound('test');`)
		})

		it('should route PlaySoundAt to the global API', () => {
			const vbs = `PlaySoundAt "test", 100, 200\n`
			const js = transform(vbs, table, player)
			expect(js).to.equal(`${Transformer.GLOBAL_NAME}.PlaySoundAt('test', 100, 200);`)
		})

		it('should not use a global variable for members', () => {
			const vbs = `vpmFlips.Name = "vpmFlips"\n`
			const js = transform(vbs, table, player)
			expect(js).to.equal(`vpmFlips.Name = 'vpmFlips';`)
		})

		it('should not use a global variable for members of members', () => {
			const vbs = `myObj.vpmFlips.Name = "vpmFlips"\n`
			const js = transform(vbs, table, player)
			expect(js).to.equal(`myObj.vpmFlips.Name = 'vpmFlips';`)
		})

		it('should use a global variable root object name', () => {
			const vbs = `Name.Test = "vpmFlips"\n`
			const js = transform(vbs, table, player)
			expect(js).to.equal(`${Transformer.GLOBAL_NAME}.Name.Test = 'vpmFlips';`)
		})
	})

	describe('for JS-reserved words', () => {
		it('should rename an unresolved `switch` variable', () => {
			const vbs = `Dim switch\nswitch = 1\n`
			const js = transform(vbs, table, player)
			expect(js).to.equal(`let aSwitch;\naSwitch = 1;`)
		})

		it('should rename other unresolved reserved words', () => {
			const vbs = `Dim var\nvar = 1\nDim this\nthis = 2\nDim typeof\ntypeof = 3\n`
			const js = transform(vbs, table, player)
			expect(js).to.equal(`let aVar;\naVar = 1;\nlet aThis;\naThis = 2;\nlet aTypeof;\naTypeof = 3;`)
		})

		it('should prefer a table element named `Switch` over the rename', () => {
			const switchTable = new TableBuilder().addFlipper('Switch').build()
			const vbs = `Switch.Hit\n`
			const js = transform(vbs, switchTable, player)
			expect(js).to.equal(`${Transformer.ITEMS_NAME}.Switch.Hit();`)
		})

		it('should not rename member names', () => {
			const vbs = `x = foo.switch\n`
			const js = transform(vbs, table, player)
			expect(js).to.equal(`x = foo.switch;`)
		})
	})

	describe('for CreateObject without a call', () => {
		it('should not throw on a bare CreateObject reference', () => {
			const vbs = `x = CreateObject\n`
			const js = transform(vbs, table, player)
			expect(js).to.equal(`x = ${Transformer.STDLIB_NAME}.CreateObject;`)
		})

		it('should not push the player object into an unrelated call', () => {
			const vbs = `If IsEmpty(CreateObject) Then x = 1 End If\n`
			const js = transform(vbs, table, player)
			expect(js).to.equal(
				`if (${Transformer.STDLIB_NAME}.IsEmpty(${Transformer.STDLIB_NAME}.CreateObject)) {\n    x = 1;\n}`,
			)
		})

		it('should still push the player object into a direct call', () => {
			const vbs = `Set d = CreateObject("Scripting.Dictionary")\n`
			const js = transform(vbs, table, player)
			expect(js).to.equal(
				`d = ${Transformer.STDLIB_NAME}.CreateObject('Scripting.Dictionary', ${Transformer.PLAYER_NAME});`,
			)
		})
	})

	it('should not convert global to local if object does not exist', () => {
		const vbs = `NoExisto.SomeFunct\n`
		const js = transform(vbs, table, player)
		expect(js).to.equal(`NoExisto.SomeFunct();`)
	})

	it('should convert Execute to eval()', () => {
		const vbs = `x = Execute("1")\n`
		const js = transform(vbs, table, player)
		expect(js).to.equal(`x = eval(${Transformer.VBSHELPER_NAME}.transpileInline('1'));`)
	})

	it('should convert ExecuteGlobal to eval()', () => {
		const vbs = `x = ExecuteGlobal("1")\n`
		const js = transform(vbs, table, player)
		expect(js).to.equal(`x = eval(${Transformer.VBSHELPER_NAME}.transpileInline('1'));`)
	})

	it('should convert Eval to eval()', () => {
		const vbs = `x = Eval("1")\n`
		const js = transform(vbs, table, player)
		expect(js).to.equal(`x = eval(${Transformer.VBSHELPER_NAME}.transpileInline('1'));`)
	})

	it('should add the scope to GetRef', () => {
		const vbs = `x = GetRef("foo")\n`
		const js = transform(vbs, table, player)
		expect(js).to.equal(`x = ${Transformer.STDLIB_NAME}.GetRef('foo', ${Transformer.SCOPE_NAME});`)
	})
})

function transform(vbs: string, table: Table, player: Player): string {
	const scriptHelper = new ScriptHelper()
	const ast = scriptHelper.vbsToAst(vbs)
	const referenceTransformer = new ReferenceTransformer(
		ast,
		table,
		table.getElementApis(),
		Enums,
		new GlobalApi(table, player),
		new Stdlib(),
	)
	const eventAst = referenceTransformer.transform()
	return scriptHelper.astToJs(eventAst)
}
