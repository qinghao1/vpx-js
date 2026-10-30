// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { TableBuilder } from '../../../test/table-builder.js'
import { Player } from '../../game/player.js'
import type { Table } from '../../vpt/table/table.js'
import { Transpiler } from '../transpiler.js'
import { ERR } from './err.js'

chai.use((sinonChai as any).default ?? sinonChai)

describe('The VBScript stdlib', () => {
	let table: Table
	let player: Player

	before(async () => {
		table = new TableBuilder().addFlipper('Flipper').build()
		player = new Player(table)
	})

	afterEach(() => {
		ERR.Clear()
		ERR.OnErrorGoto0()
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

		expect(scope.result).to.equal(Math.fround(1.3))
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

	it('should initialize bare Dim variables to Empty, not Null', () => {
		const scope = {} as any
		const vbs = `dim v1\nresult1 = IsEmpty(v1)\nresult2 = (v1 = "")\nresult3 = v1 & "a"\nresult4 = TypeName(v1)`
		const transpiler = new Transpiler(table, player)
		transpiler.execute(vbs, scope, 'global')

		expect(scope.v1).to.be.undefined
		expect(scope.result1).to.equal(true)
		expect(scope.result2).to.equal(true)
		expect(scope.result3).to.equal('a')
		expect(scope.result4).to.equal('Empty')
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

	it('should provide the Round function', () => {
		const scope = {} as any
		const vbs = `result1 = Round(2.5)\nresult2 = Round(3.5)\nresult3 = Round(3.14159, 2)\nresult4 = Round(-2.5)`
		const transpiler = new Transpiler(table, player)
		transpiler.execute(vbs, scope, 'global')

		expect(scope.result1).to.equal(2)
		expect(scope.result2).to.equal(4)
		expect(scope.result3).to.equal(3.14)
		expect(scope.result4).to.equal(-2)
	})

	it('should round Empty to 0 instead of producing NaN', () => {
		const scope = {} as any
		const vbs = `Dim base\nresult1 = Round(base, 0)\nresult2 = Round(base, 0) And &HFF`
		const transpiler = new Transpiler(table, player)
		transpiler.execute(vbs, scope, 'global')

		expect(scope.result1).to.equal(0)
		expect(scope.result2).to.equal(0)
	})

	it('should raise VBS errors for bad Round operands', () => {
		const rows: Array<[string, number]> = [
			['Round("abc")', 13],
			['Round("")', 13],
			['Round(Null)', 94],
			['Round(Nothing)', 91],
		]
		for (const [expr, code] of rows) {
			const scope = {} as any
			new Transpiler(table, player).execute(
				`On Error Resume Next\nresult = ${expr}\ncode = Err.Number`,
				scope,
				'global',
			)
			expect(scope.code, expr).to.equal(code)
			ERR.Clear()
			ERR.OnErrorGoto0()
		}
	})

	it('should provide the UCase function', () => {
		const scope = {} as any
		const vbs = `result = UCase("abC123")`
		const transpiler = new Transpiler(table, player)
		transpiler.execute(vbs, scope, 'global')

		expect(scope.result).to.equal('ABC123')
	})

	it('should provide the LCase function', () => {
		const scope = {} as any
		const vbs = `result = LCase("aBC123")`
		const transpiler = new Transpiler(table, player)
		transpiler.execute(vbs, scope, 'global')

		expect(scope.result).to.equal('abc123')
	})

	it('should provide the Trim function', () => {
		const scope = {} as any
		const vbs = `result = Trim("  padded  ")`
		const transpiler = new Transpiler(table, player)
		transpiler.execute(vbs, scope, 'global')

		expect(scope.result).to.equal('padded')
	})

	it('should provide the InStr function', () => {
		const scope = {} as any
		const vbs = `result1 = InStr("abc", "b")\nresult2 = InStr("abc", "z")\nresult3 = InStr(3, "abcabc", "bc")\nresult4 = InStr(1, "ABC", "b", 1)`
		const transpiler = new Transpiler(table, player)
		transpiler.execute(vbs, scope, 'global')

		expect(scope.result1).to.equal(2)
		expect(scope.result2).to.equal(0)
		expect(scope.result3).to.equal(5)
		expect(scope.result4).to.equal(2)
	})

	it('should provide the Split function', () => {
		const scope = {} as any
		const vbs = `result = Split("VBScript|is|fun!", "|")`
		const transpiler = new Transpiler(table, player)
		transpiler.execute(vbs, scope, 'global')

		expect(scope.result).to.deep.equal(['VBScript', 'is', 'fun!'])
	})

	it('should provide the Join function', () => {
		const scope = {} as any
		const vbs = `dim arr(1)\narr(0) = "a"\narr(1) = "b"\nresult = Join(arr, ",")`
		const transpiler = new Transpiler(table, player)
		transpiler.execute(vbs, scope, 'global')

		expect(scope.result).to.equal('a,b')
	})

	it('should provide the Replace function', () => {
		const scope = {} as any
		const vbs = `result1 = Replace("aaabaaa", "a", "b")\nresult2 = Replace("aaabaaa", "a", "b", 1, 2)\nresult3 = Replace("ABC", "b", "x", 1, -1, 1)\nresult4 = Replace("aabc", "a", "x", 2)`
		const transpiler = new Transpiler(table, player)
		transpiler.execute(vbs, scope, 'global')

		expect(scope.result1).to.equal('bbbbbbb')
		expect(scope.result2).to.equal('bbabaaa')
		expect(scope.result3).to.equal('AxC')
		expect(scope.result4).to.equal('xbc')
	})

	it('should provide the Chr function', () => {
		const scope = {} as any
		const vbs = `result = Chr(65)`
		const transpiler = new Transpiler(table, player)
		transpiler.execute(vbs, scope, 'global')

		expect(scope.result).to.equal('A')
	})

	it('should provide the Asc function', () => {
		const scope = {} as any
		const vbs = `result = Asc("ABC")`
		const transpiler = new Transpiler(table, player)
		transpiler.execute(vbs, scope, 'global')

		expect(scope.result).to.equal(65)
	})

	it('should provide the IsNumeric function', () => {
		const scope = {} as any
		const vbs = `result1 = IsNumeric("12")\nresult2 = IsNumeric("12.5")\nresult3 = IsNumeric("abc")\nresult4 = IsNumeric("")\nresult5 = IsNumeric(CDate("2024-01-15"))`
		const transpiler = new Transpiler(table, player)
		transpiler.execute(vbs, scope, 'global')

		expect(scope.result1).to.equal(true)
		expect(scope.result2).to.equal(true)
		expect(scope.result3).to.equal(false)
		expect(scope.result4).to.equal(false)
		expect(scope.result5).to.equal(true)
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

	it('should provide the CBool..RGB conversion functions', () => {
		const rows: Array<[string, unknown]> = [
			['CBool(1)', true],
			['CBool(0)', false],
			['CBool("true")', true],
			['CBool("0")', false],
			['CByte(2.5)', 2],
			['CByte(255)', 255],
			['CInt(1.9)', 2],
			['CInt(2.5)', 2],
			['CInt("42")', 42],
			['CInt("&HFF")', 255],
			['CLng(1.5)', 2],
			['CLng("42")', 42],
			['CLng("&O17")', 15],
			['CSng(1.5)', 1.5],
			['CDbl("3.5")', 3.5],
			['CStr(42)', '42'],
			['CStr(True)', 'True'],
			['TypeName(CDate("2020-01-02"))', 'Date'],
			['CCur(1.234)', 1.234],
			['CCur(1.23456)', 1.2346],
			['RGB(255, 0, 0)', 16711680],
			['RGB(1, 2, 3)', 66051],
		]
		for (const [expr, expected] of rows) {
			const scope = {} as any
			new Transpiler(table, player).execute(`result = ${expr}`, scope, 'global')
			expect(scope.result, expr).to.equal(expected)
		}
	})

	it('should convert True to -1 in numeric conversions', () => {
		const rows: Array<[string, unknown]> = [
			['CInt(True)', -1],
			['CLng(True)', -1],
			['CDbl(True)', -1],
			['CSng(True)', -1],
			['CCur(True)', -1],
			['CInt(False)', 0],
		]
		for (const [expr, expected] of rows) {
			const scope = {} as any
			new Transpiler(table, player).execute(`result = ${expr}`, scope, 'global')
			expect(scope.result, expr).to.equal(expected)
		}
	})

	it('should raise VBS errors for bad conversions', () => {
		const rows: Array<[string, number]> = [
			['CInt("abc")', 13],
			['CInt("")', 13],
			['CInt("0x1A")', 13],
			['CInt(40000)', 6],
			['CInt(-40000)', 6],
			['CInt(Null)', 94],
			['CInt(Nothing)', 91],
			['CLng(Nothing)', 91],
			['CByte(300)', 6],
			['CByte(-5)', 6],
			['CByte("abc")', 13],
			['CByte(True)', 6],
			['CByte(Null)', 94],
			['CLng(2147483648)', 6],
			['CLng("abc")', 13],
			['CLng(Null)', 94],
			['CSng("abc")', 13],
			['CSng("1e3000")', 6],
			['CSng(Null)', 94],
			['CDbl("abc")', 13],
			['CDbl(Null)', 94],
			['CCur("abc")', 13],
			['CCur(Null)', 94],
			['CBool("abc")', 13],
			['CBool("")', 13],
			['CBool("   ")', 13],
			['CBool(Null)', 94],
			['CStr(Null)', 94],
			['CDate("bogus")', 13],
			['CDate("")', 13],
			['CDate(Null)', 94],
			['CDate(Nothing)', 91],
		]
		for (const [expr, code] of rows) {
			const scope = {} as any
			new Transpiler(table, player).execute(
				`On Error Resume Next\nresult = ${expr}\ncode = Err.Number`,
				scope,
				'global',
			)
			expect(scope.code, expr).to.equal(code)
			ERR.Clear()
			ERR.OnErrorGoto0()
		}
	})

	it('should throw bad conversions without On Error Resume Next', () => {
		expect(() => {
			new Transpiler(table, player).execute('result = CInt("abc")', {} as any, 'global')
		}).to.throw()
		expect(() => {
			new Transpiler(table, player).execute('result = CBool("")', {} as any, 'global')
		}).to.throw()
	})

	it('should distinguish Null, Empty, and Nothing', () => {
		const scope = {} as any
		const vbs = [
			'r1 = IsEmpty(Null)',
			'r2 = IsEmpty(Empty)',
			'r3 = IsNull(Null)',
			'r4 = IsNull(1)',
			'r5 = IsNull(Empty)',
			'r6 = IsObject(Null)',
			'r7 = IsObject(Empty)',
			'r8 = IsObject(Nothing)',
			'r9 = TypeName(Empty)',
			'r10 = TypeName(Null)',
			'r11 = TypeName(Nothing)',
			'Set d = CreateObject("Scripting.Dictionary")',
			'r12 = IsObject(d)',
			'r13 = IsEmpty(d)',
			'Set x = Nothing',
			'r14 = IsObject(x)',
			'r15 = IsEmpty(x)',
			'If x Is Nothing Then r16 = 1 Else r16 = 0',
		].join('\n')
		new Transpiler(table, player).execute(vbs, scope, 'global')

		expect(scope.r1).to.equal(false)
		expect(scope.r2).to.equal(true)
		expect(scope.r3).to.equal(true)
		expect(scope.r4).to.equal(false)
		expect(scope.r5).to.equal(false)
		expect(scope.r6).to.equal(false)
		expect(scope.r7).to.equal(false)
		expect(scope.r8).to.equal(true)
		expect(scope.r9).to.equal('Empty')
		expect(scope.r10).to.equal('Null')
		expect(scope.r11).to.equal('Nothing')
		expect(scope.r12).to.equal(true)
		expect(scope.r13).to.equal(false)
		expect(scope.r14).to.equal(true)
		expect(scope.r15).to.equal(false)
		expect(scope.r16).to.equal(1)
	})

	it('should raise error 91 on member access of Nothing', () => {
		const scope = {} as any
		new Transpiler(table, player).execute(
			'On Error Resume Next\nSet x = Nothing\nr = x.foo\ncode = Err.Number',
			scope,
			'global',
		)
		expect(scope.code).to.equal(91)
	})

	it('should yield Null from string functions given Null', () => {
		const exprs = [
			'Len(Null)',
			'Left(Null, 1)',
			'Left("abc", Null)',
			'Right(Null, 1)',
			'Mid(Null, 1)',
			'Mid("abc", Null)',
			'UCase(Null)',
			'LCase(Null)',
			'Trim(Null)',
			'Split(Null, ",")',
			'Join(Null, ",")',
			'Replace(Null, "a", "b")',
			'Replace("abc", Null, "b")',
			'InStr(Null, "b")',
			'InStr("abc", Null)',
			'InStrRev(Null, "b")',
		]
		for (const expr of exprs) {
			const scope = {} as any
			new Transpiler(table, player).execute(`result = ${expr}\ncode = Err.Number`, scope, 'global')
			expect(scope.result, expr).to.equal(null)
			expect(scope.code, expr).to.equal(0)
		}
	})

	it('should keep Empty lenient in string functions', () => {
		const rows: Array<[string, unknown]> = [
			['Len(Empty)', 0],
			['Left(Empty, 1)', ''],
			['UCase(Empty)', ''],
			['Trim(Empty)', ''],
		]
		for (const [expr, expected] of rows) {
			const scope = {} as any
			new Transpiler(table, player).execute(`result = ${expr}`, scope, 'global')
			expect(scope.result, expr).to.equal(expected)
		}
		const scope = {} as any
		new Transpiler(table, player).execute('result = Split(Empty, ",")', scope, 'global')
		expect(scope.result).to.deep.equal([])
	})

	it('should support the InStr compare form without a start', () => {
		const scope = {} as any
		const vbs = 'result1 = InStr("abc", "b", 1)\nresult2 = InStr(1, "abc", "b")'
		new Transpiler(table, player).execute(vbs, scope, 'global')

		expect(scope.result1).to.equal(2)
		expect(scope.result2).to.equal(2)
	})

	it('should map Empty to "" in InStrRev', () => {
		const scope = {} as any
		const vbs = [
			'Dim e',
			'r1 = InStrRev(e, "b")',
			'r2 = InStrRev("abcabc", e)',
			'r3 = InStrRev("abcabc", "bc")',
			'r4 = InStrRev(12345, 34)',
			'code = Err.Number',
		].join('\n')
		new Transpiler(table, player).execute(vbs, scope, 'global')

		expect(scope.r1).to.equal(0)
		expect(scope.r2).to.equal(6)
		expect(scope.r3).to.equal(5)
		expect(scope.r4).to.equal(3)
		expect(scope.code).to.equal(0)
	})

	it('should walk dimensions in UBound', () => {
		const scope = {} as any
		new Transpiler(table, player).execute('Dim a(2, 3)\nr1 = UBound(a)\nr2 = UBound(a, 2)', scope, 'global')

		expect(scope.r1).to.equal(2)
		expect(scope.r2).to.equal(3)
	})

	it('should raise error 9 for bad UBound dimensions', () => {
		const rows: Array<[string, number]> = [
			['Dim a(2)\nr = UBound(a, 2)', 9],
			['Dim a(2, 3)\nr = UBound(a, 3)', 9],
			['Dim a(2)\nr = UBound(a, 0)', 9],
		]
		for (const [vbs, code] of rows) {
			const scope = {} as any
			new Transpiler(table, player).execute(`On Error Resume Next\n${vbs}\ncode = Err.Number`, scope, 'global')
			expect(scope.r, vbs).to.equal(-1)
			expect(scope.code, vbs).to.equal(code)
			ERR.Clear()
			ERR.OnErrorGoto0()
		}
	})

	it('should create a Dictionary via CreateObject', () => {
		const scope = {} as any
		const vbs = `Set d = CreateObject("Scripting.Dictionary")\nd.Add "k", "v"\nresult = d.Item("k")`
		const transpiler = new Transpiler(table, player)
		transpiler.execute(vbs, scope, 'global')

		expect(scope.result).to.equal('v')
	})
})
