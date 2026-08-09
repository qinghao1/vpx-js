// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { TableBuilder } from '../../../test/table-builder.js'
import { Player } from '../../game/player.js'
import type { Table } from '../../vpt/table/table.js'
import { Transpiler } from '../transpiler.js'

chai.use((sinonChai as any).default ?? sinonChai)

describe('The VBScript stdlib', () => {
	let table: Table
	let player: Player

	before(async () => {
		table = new TableBuilder().addFlipper('Flipper').build()
		player = new Player(table)
	})

	it('should provide the Abs function', () => {
		const scope = {} as any
		const vbs = `result = Abs(-483.3)`
		const transpiler = new Transpiler(table, player)
		transpiler.execute(vbs, scope, 'global')

		expect(scope.result).to.equal(483.3)
	})

	it('should provide the Cos function', () => {
		const scope = {} as any
		const vbs = `result = Cos(90)`
		const transpiler = new Transpiler(table, player)
		transpiler.execute(vbs, scope, 'global')

		expect(scope.result).to.equal(Math.cos(90))
	})

	it('should provide the Csng function', () => {
		const scope = {} as any
		const vbs = `result = csng(1.3)`
		const transpiler = new Transpiler(table, player)
		transpiler.execute(vbs, scope, 'global')

		expect(scope.result).to.equal(1.3)
	})

	it('should provide the Int function', () => {
		const scope = {} as any
		const vbs = `result = Int(1.3)`
		const transpiler = new Transpiler(table, player)
		transpiler.execute(vbs, scope, 'global')

		expect(scope.result).to.equal(1)
	})

	it('should provide the Sin function', () => {
		const scope = {} as any
		const vbs = `result = Sin(90)`
		const transpiler = new Transpiler(table, player)
		transpiler.execute(vbs, scope, 'global')

		expect(scope.result).to.equal(Math.sin(90))
	})

	it('should provide the Sqr function', () => {
		const scope = {} as any
		const vbs = `result = sqr(9)`
		const transpiler = new Transpiler(table, player)
		transpiler.execute(vbs, scope, 'global')

		expect(scope.result).to.equal(3)
	})

	it('should provide the UBound function', () => {
		const scope = {} as any
		const vbs = `dim arr(9)\nresult = UBound(arr)`
		const transpiler = new Transpiler(table, player)
		transpiler.execute(vbs, scope, 'global')

		expect(scope.result).to.equal(9)
	})

	it('should provide the IsArray function', () => {
		const scope = {} as any
		const vbs = `dim arr(9)\nresult1 = IsArray(arr)\ndim narr\nresult2 = IsArray(narr)`
		const transpiler = new Transpiler(table, player)
		transpiler.execute(vbs, scope, 'global')

		expect(scope.result1).to.equal(true)
		expect(scope.result2).to.equal(false)
	})

	it('should provide the IsEmpty function', () => {
		const scope = {} as any
		const vbs = `dim v1\ndim v2\ndim arr1(0)\nredim arr2(1)\nv2 = "test"\nresult1 = IsEmpty(v1)\nresult2 = IsEmpty(v2)\nresult3 = IsEmpty(arr1)\nresult4 = IsEmpty(arr2)`
		const transpiler = new Transpiler(table, player)
		transpiler.execute(vbs, scope, 'global')

		expect(scope.result1).to.equal(true)
		expect(scope.result2).to.equal(false)
		expect(scope.result3).to.equal(false)
		expect(scope.result4).to.equal(false)
	})

	it('should provide the MsgBox function', () => {
		const vbs = `MsgBox "duh"`
		const transpiler = new Transpiler(table, player)
		transpiler.execute(vbs, {}, 'global')
	})

	it('should provide the Randomize function', () => {
		const scope = {} as any
		const vbs = `Randomize`
		const transpiler = new Transpiler(table, player)
		transpiler.execute(vbs, scope, 'global')
	})

	it('should provide the Math object', () => {
		const scope = {} as any
		const vbs = `result = math`
		const transpiler = new Transpiler(table, player)
		transpiler.execute(vbs, scope, 'global')

		expect(scope.result).to.be.ok
	})

	it('should provide the Err object', () => {
		const scope = {} as any
		const vbs = `result = Err`
		const transpiler = new Transpiler(table, player)
		transpiler.execute(vbs, scope, 'global')

		expect(scope.result).to.be.ok
	})

	it('should provide vb string constants', () => {
		const scope = {} as any
		const vbs = `_vbCr = vbCr\n_vbCrLf = vbCrLf\n_vbFormFeed = vbFormFeed\n_vbLf = vbLf\n_vbNewLine = vbNewLine\n_vbNullChar = vbNullChar\n_vbNullString = vbNullString\n_vbTab = vbTab\n_vbVerticalTab = vbVerticalTab`
		const transpiler = new Transpiler(table, player)
		transpiler.execute(vbs, scope, 'global')

		expect(scope._vbCr).to.equal('\x0d')
		expect(scope._vbCrLf).to.equal('\x0d\x0a')
		expect(scope._vbFormFeed).to.equal('\x0c')
		expect(scope._vbLf).to.equal('\x0a')
		expect(scope._vbNewLine).to.equal('\n')
		expect(scope._vbNullChar).to.equal('\x00')
		expect(scope._vbNullString).to.equal(null)
		expect(scope._vbTab).to.equal('\x09')
		expect(scope._vbVerticalTab).to.equal('\x0b')
	})
})
