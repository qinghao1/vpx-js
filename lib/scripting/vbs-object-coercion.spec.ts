// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
/**
 * VBS objects in coercion positions must surface a VbsError, never a raw JS
 * TypeError. Regression: walking_dead.vpx crashed with
 * "Uncaught TypeError: Cannot convert object to primitive value" via
 * cvpmTrough.AddBall -> NeedUpdate -> cvpmTimer.EnableUpdate ->
 * cvpmDictionary.Add, where a VBS class instance (`Me`) is used as a key.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { TableBuilder } from '../../test/table-builder.js'
import { Player } from '../game/player.js'
import type { Table } from '../vpt/table/table.js'
import { ERR, VbsError } from './stdlib/err.js'
import { Stdlib } from './stdlib/index.js'
import { Transpiler } from './transpiler.js'
import { vbsAdd, vbsConcat, vbsDiv, vbsEquals, vbsIntDiv, vbsLt, vbsMod, vbsMul, vbsSub } from './vbs-values.js'

afterEach(() => {
	ERR.Clear()
	ERR.OnErrorGoto0()
})

/** An object with no primitive conversion: no prototype, so Number()/String() throw a raw TypeError on it. */
const exotic = (): unknown => Object.create(null)

describe('vbs arithmetic with a non-convertible object', () => {
	it.each([
		['add', vbsAdd],
		['sub', vbsSub],
		['mul', vbsMul],
		['div', vbsDiv],
		['mod', vbsMod],
	] as Array<[string, (left: unknown, right: unknown) => unknown]>)(
		'%s raises type mismatch instead of leaking a TypeError',
		(_name, fn) => {
			for (const args of [
				[exotic(), 1],
				[1, exotic()],
			] as Array<[unknown, unknown]>) {
				let error: unknown
				try {
					fn(args[0], args[1])
				} catch (e) {
					error = e
				}
				expect(error).toBeInstanceOf(VbsError)
				expect((error as VbsError).code).toBe(13)
			}
		},
	)

	it.each([
		['add', vbsAdd],
		['sub', vbsSub],
		['mul', vbsMul],
		['div', vbsDiv],
		['mod', vbsMod],
	] as Array<[string, (left: unknown, right: unknown) => unknown]>)(
		'%s records 13 under On Error Resume Next',
		(_name, fn) => {
			ERR.OnErrorResumeNext()
			expect(fn(exotic(), 1)).toBe(undefined)
			expect(ERR.Number).toBe(13)
		},
	)

	it('intdiv raises type mismatch instead of leaking a TypeError', () => {
		expect(() => vbsIntDiv(exotic() as number, 1)).toThrow(VbsError)
		ERR.OnErrorResumeNext()
		expect(vbsIntDiv(exotic() as number, 1)).toBe(undefined)
		expect(ERR.Number).toBe(13)
	})

	it('concat raises type mismatch instead of leaking a TypeError', () => {
		expect(() => vbsConcat(exotic(), 'x')).toThrow(VbsError)
		ERR.OnErrorResumeNext()
		expect(vbsConcat(exotic(), 'x')).toBe('x')
		expect(ERR.Number).toBe(13)
	})

	it('comparison raises type mismatch instead of leaking a TypeError', () => {
		expect(() => vbsLt(exotic(), 1)).toThrow(VbsError)
		ERR.OnErrorResumeNext()
		expect(vbsLt(exotic(), 1)).toBe(undefined)
		expect(ERR.Number).toBe(13)
	})

	it('equality raises type mismatch instead of leaking a TypeError', () => {
		expect(() => vbsEquals(exotic(), 5)).toThrow(VbsError)
		ERR.OnErrorResumeNext()
		expect(vbsEquals(exotic(), 5)).toBe(false)
		expect(ERR.Number).toBe(13)
	})

	it('conversion functions raise type mismatch instead of leaking a TypeError', () => {
		const stdlib = new Stdlib()
		expect(() => stdlib.CInt(exotic())).toThrow(VbsError)
		expect(() => stdlib.CStr(exotic())).toThrow(VbsError)
	})
})

describe('VBS class instances in coercion positions', () => {
	let table: Table
	let player: Player
	let transpiler: Transpiler

	beforeAll(() => {
		table = new TableBuilder().addFlipper('Flipper').build()
		player = new Player(table)
		transpiler = new Transpiler(table, player)
	})

	it('adds a number to a class instance as a VbsError, not a TypeError', () => {
		const vbs = 'Class Box\nEnd Class\nDim b\nSet b = New Box\nr = b + 1\n'
		let error: unknown
		try {
			transpiler.execute(vbs, {} as any, 'global')
		} catch (e) {
			error = e
		}
		expect(error).toBeInstanceOf(VbsError)
		expect((error as VbsError).code).toBe(13)
	})

	it('uses a class instance as a dictionary key without throwing', () => {
		const vbs =
			'Class Box\nEnd Class\n' +
			'Dim d\nSet d = CreateObject("Scripting.Dictionary")\n' +
			'Dim b\nSet b = New Box\n' +
			'd("seed") = 1\nd(b) = 2\nr = d(b)\n'
		const scope: any = {}
		transpiler.execute(vbs, scope, 'global')
		expect(scope.r).toBe(2)
	})

	it('runs the core.vbs addball/needupdate/enableupdate/add path without throwing', () => {
		// Trimmed mirror of res/scripts/core.vbs: cvpmTrough.AddBall sets
		// NeedUpdate, whose setter calls vpmTimer.EnableUpdate with `Me`,
		// which registers the instance via cvpmDictionary.Add.
		const vbs =
			'Class FakeDict\n' +
			'Private mStore\n' +
			'Private Sub Class_Initialize\n' +
			'Set mStore = CreateObject("Scripting.Dictionary")\n' +
			'End Sub\n' +
			'Public Sub Add(aKey, aItem)\n' +
			'If IsObject(aItem) Then\n' +
			'Set mStore(aKey) = aItem\n' +
			'Else\n' +
			'mStore(aKey) = aItem\n' +
			'End If\n' +
			'End Sub\n' +
			'End Class\n' +
			'Class FakeTimer\n' +
			'Private mSlowUpdates\n' +
			'Private Sub Class_Initialize\n' +
			'Set mSlowUpdates = New FakeDict\n' +
			'End Sub\n' +
			'Public Sub EnableUpdate(aClass, aFast, aEnabled)\n' +
			'If aEnabled Then\n' +
			'mSlowUpdates.Add aClass, 0\n' +
			'End If\n' +
			'End Sub\n' +
			'End Class\n' +
			'Class FakeTrough\n' +
			'Private mTimer\n' +
			'Public Sub Init(t)\n' +
			'Set mTimer = t\n' +
			'End Sub\n' +
			'Private Property Let NeedUpdate(aEnabled)\n' +
			'mTimer.EnableUpdate Me, False, aEnabled\n' +
			'End Property\n' +
			'Public Sub AddBall()\n' +
			'NeedUpdate = True\n' +
			'End Sub\n' +
			'End Class\n' +
			'Dim timer\nSet timer = New FakeTimer\n' +
			'Dim trough\nSet trough = New FakeTrough\n' +
			'trough.Init timer\n' +
			'trough.AddBall\ndone = True\n'
		const scope: any = {}
		let error: unknown
		try {
			transpiler.execute(vbs, scope, 'global')
		} catch (e) {
			error = e
		}
		expect(error).toBe(undefined)
		expect(scope.done).toBe(true)
	})
})
