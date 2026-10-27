// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { describe, expect, it } from 'vitest'
import { TableBuilder } from '../../test/table-builder.js'
import { Player } from '../game/player.js'
import type { Table } from '../vpt/table/table.js'
import { ERR, VbsError } from './stdlib/err.js'
import { Transpiler } from './transpiler.js'

/**
 * End-to-end coercion semantics of the VBS runtime helpers: every case runs
 * a real table-script fragment through the transpiler and asserts the
 * observable result (values and `Err` state), never the emitted code shape.
 */
describe('The VBScript transpiler - Runtime coercion', () => {
	let table: Table
	let player: Player

	before(async () => {
		table = new TableBuilder().build()
		player = new Player(table)
	})

	afterEach(() => {
		ERR.Clear()
		ERR.OnErrorGoto0()
	})

	function execute(vbs: string): any {
		const scope = {} as any
		new Transpiler(table, player).execute(vbs, scope, 'global')
		return scope
	}

	function executeRecorded(vbs: string): any {
		return execute(`On Error Resume Next\n${vbs}`)
	}

	it('should coerce integer-division operands like the other arithmetic operators', () => {
		expect(execute('x = True \\ 2').x).to.equal(0)
		expect(execute('Dim e\nx = e \\ 2').x).to.equal(0)
		expect(execute('x = "&H10" \\ 2').x).to.equal(8)
		expect(execute('x = "6" \\ "3"').x).to.equal(2)
	})

	it('should raise error 13 for garbage integer-division operands', () => {
		try {
			execute('x = "abc" \\ 2')
			expect.fail('should have raised error 13')
		} catch (e) {
			expect(e).to.be.an.instanceof(VbsError)
			expect((e as VbsError).code).to.equal(13)
		}
		const scope = executeRecorded('x = "abc" \\ 2\ny = Err.Number')
		expect(scope.y).to.equal(13)
	})

	it('should raise error 6 for out-of-range integer division', () => {
		const scope = executeRecorded('x = 1E308 \\ 1\ny = Err.Number')
		expect(scope.y).to.equal(6)
	})

	it('should raise error 11 for an Empty integer-division divisor', () => {
		const scope = executeRecorded('Function F(a, b)\nF = a \\ b\nEnd Function\nx = F(7)\ny = Err.Number')
		expect(scope.y).to.equal(11)
	})

	it('should evaluate the exponent operator with VBScript coercion', () => {
		expect(execute('x = 2 ^ 3').x).to.equal(8)
		expect(execute('x = "&H10" ^ 2').x).to.equal(256)
		expect(execute('x = True ^ 2').x).to.equal(1)
		expect(execute('x = Null ^ 2').x).to.be.null
	})

	it('should raise error 13 for garbage exponent operands', () => {
		const scope = executeRecorded('x = "abc" ^ 2\ny = Err.Number')
		expect(scope.y).to.equal(13)
	})

	it('should raise error 6 for an overflowing exponent', () => {
		const scope = executeRecorded('x = 10 ^ 400\ny = Err.Number')
		expect(scope.y).to.equal(6)
	})

	it('should negate with VBScript coercion instead of raw JS negation', () => {
		// True is -1, so -True is 1 (raw JS `-true` would leak -1).
		expect(execute('x = -True').x).to.equal(1)
		expect(execute('Dim e\nx = -e').x).to.equal(0)
		expect(execute('x = -Null').x).to.be.null
	})

	it('should treat missing arguments as Empty when negating', () => {
		expect(execute('Function F(a, b)\nF = -b\nEnd Function\nx = F(5)').x).to.equal(0)
	})

	it('should raise error 13 when negating garbage', () => {
		const scope = executeRecorded('x = -"abc"\ny = Err.Number')
		expect(scope.y).to.equal(13)
	})

	it('should coerce Empty to 0 in addition instead of passing the operand through', () => {
		expect(execute('Dim e\nx = e + True').x).to.equal(-1)
		expect(execute('Dim e\nx = e + "2"').x).to.equal(2)
	})

	it('should raise error 13 for Empty plus non-numeric text', () => {
		const scope = executeRecorded('Dim e\nx = e + "abc"\ny = Err.Number')
		expect(scope.y).to.equal(13)
	})

	it('should raise error 13 for garbage bitwise operands instead of coercing to 0', () => {
		for (const vbs of ['x = "abc" And 1', 'x = 1 Or "abc"', 'x = "abc" Xor 1', 'x = Not "abc"']) {
			const scope = executeRecorded(`${vbs}\ny = Err.Number`)
			expect(scope.y, vbs).to.equal(13)
		}
	})

	it('should raise error 13 for a garbage operand next to Null instead of short-circuiting', () => {
		const scope = executeRecorded('x = "abc" And Null\ny = Err.Number')
		expect(scope.y).to.equal(13)
	})

	it('should still coerce numeric strings in bitwise operations', () => {
		expect(execute('x = "6" And "3"').x).to.equal(2)
		expect(execute('x = "6" Or "3"').x).to.equal(7)
	})

	it('should raise error 91 for Nothing in numeric and string positions', () => {
		try {
			execute('x = Nothing + 1')
			expect.fail('should have raised error 91')
		} catch (e) {
			expect(e).to.be.an.instanceof(VbsError)
			expect((e as VbsError).code).to.equal(91)
		}
		// NB: `Nothing - 1` does not parse (pre-existing grammar quirk), so
		// subtraction is covered with Nothing as the right operand instead.
		for (const vbs of [
			'x = Nothing + 1',
			'x = 1 - Nothing',
			'x = Nothing * 1',
			'x = Nothing ^ 2',
			'x = -Nothing',
			'x = Nothing And 1',
			'x = Nothing & "s"',
			'x = CStr(Nothing)',
		]) {
			const scope = executeRecorded(`${vbs}\ny = Err.Number`)
			expect(scope.y, vbs).to.equal(91)
		}
	})

	it('should compare Empty equal to an empty string and to zero', () => {
		expect(execute('Dim e\nIf e = "" Then x = 1 Else x = 2').x).to.equal(1)
		expect(execute('Dim e\nIf e = 0 Then x = 1 Else x = 2').x).to.equal(1)
	})

	it('should not treat equal primitives as identical with "Is"', () => {
		expect(execute('If 5 Is 5 Then x = 1 Else x = 2').x).to.equal(2)
	})

	it('should treat the same object reference as identical with "Is"', () => {
		const scope = execute(
			'Set d = CreateObject("Scripting.Dictionary")\nSet e = d\nIf d Is e Then x = 1 Else x = 2\n',
		)
		expect(scope.x).to.equal(1)
	})

	it('should preserve the error description in record mode', () => {
		const scope = executeRecorded('x = "abc" + 1\nn = Err.Number\nd = Err.Description')
		expect(scope.n).to.equal(13)
		expect(scope.d).to.equal('Type mismatch')
	})

	it('should raise error 13 when iterating a non-collection with "For Each"', () => {
		const scope = executeRecorded('For Each e In 5\nx = 1\nNext\ny = Err.Number')
		expect(scope.y).to.equal(13)
		expect(scope.x).to.equal(undefined)
	})
})
