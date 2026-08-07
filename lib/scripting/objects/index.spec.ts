// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { TableBuilder } from '../../../test/table-builder.js'
import { Player } from '../../game/player.js'
import type { Table } from '../../vpt/table/table.js'
import { ERR } from '../stdlib/err.js'
import { Transpiler } from '../transpiler.js'

chai.use((sinonChai as any).default ?? sinonChai)

describe('The VBScript objects implementations', () => {
	let table: Table
	let player: Player
	let transpiler: Transpiler

	before(() => {
		ERR.OnErrorResumeNext()
		table = new TableBuilder().build('Table1')
		player = new Player(table)
		transpiler = new Transpiler(table, player)
	})

	after(() => {
		ERR.OnErrorGoto0()
	})

	it('should provide the "Scripting.Dictionary" object', () => {
		const scope = {} as any
		const vbs = `Dim d\nSet d = CreateObject("Scripting.Dictionary")\nd.Add "a", "Athens"`

		transpiler.execute(vbs, scope, 'global')
		expect(scope.d.Count).to.equal(1)
	})

	it('should provide the "VPinMAME.Controller" object', () => {
		const scope = {} as any
		const vbs = `Dim vpm\nSet vpm = CreateObject("VPinMAME.Controller")`

		transpiler.execute(vbs, scope, 'global')
		expect(scope.vpm).to.be.ok
	})

	it('should provide the "Scripting.FileSystemObject" object', () => {
		const scope = {} as any
		const vbs = `Dim fso\nSet fso = CreateObject("Scripting.FileSystemObject")`

		transpiler.execute(vbs, scope, 'global')
		expect(scope.fso).to.be.ok
	})

	it('should provide the "WScript.Shell" object', () => {
		const scope = {} as any
		const vbs = `Dim wss\nSet wss = CreateObject("WScript.Shell")`

		transpiler.execute(vbs, scope, 'global')
		expect(scope.wss).to.be.ok
	})

	it('should fail when providing an unknown object', () => {
		const scope = {} as any
		const vbs = `Dim x\nSet x = CreateObject("DontExist")\n`

		transpiler.execute(vbs, scope, 'global')
		expect(ERR.Number).to.equal(429)
	})
})
