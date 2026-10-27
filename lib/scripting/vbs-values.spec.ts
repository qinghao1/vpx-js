import { afterEach, describe, expect, it } from 'vitest'
import { ERR, VbsError } from './stdlib/err.js'
import { VbsUndefined } from './vbs-undefined.js'
import {
	bankersRound,
	parseNumericText,
	vbsAdd,
	vbsAnd,
	vbsConcat,
	vbsDiv,
	vbsEquals,
	vbsEqv,
	vbsGt,
	vbsGte,
	vbsIntDiv,
	vbsLt,
	vbsLte,
	vbsMod,
	vbsMul,
	vbsNot,
	vbsNotEquals,
	vbsOr,
	vbsSub,
	vbsXor,
} from './vbs-values.js'

afterEach(() => {
	ERR.Clear()
	ERR.OnErrorGoto0()
})

describe('vbs-values logical operators', () => {
	it.each([
		['and', true, true, true],
		['and', true, false, false],
		['and', false, false, false],
		['and', 6, 3, 2],
		['and', true, 1, 1],
		['and', false, 1, 0],
		['and', '6', '3', 2],
		['and', true, null, null],
		['and', false, null, false],
		['and', null, null, null],
		['and', 0, null, false],
		['and', 5, null, null],
	] as Array<[string, unknown, unknown, unknown]>)('%s(%s, %s) is %s', (_op, left, right, expected) => {
		expect(vbsAnd(left, right)).to.equal(expected)
	})

	it.each([
		[true, true, true],
		[true, false, true],
		[false, false, false],
		[6, 3, 7],
		[false, 1, 1],
		[true, null, true],
		[false, null, null],
		[null, null, null],
		[0, null, null],
		[5, null, true],
	] as Array<[unknown, unknown, unknown]>)('or(%s, %s) is %s', (left, right, expected) => {
		expect(vbsOr(left, right)).to.equal(expected)
	})

	it.each([
		[true, true, false],
		[true, false, true],
		[6, 3, 5],
		[null, 5, null],
		[5, null, null],
	] as Array<[unknown, unknown, unknown]>)('xor(%s, %s) is %s', (left, right, expected) => {
		expect(vbsXor(left, right)).to.equal(expected)
	})

	it.each([
		[true, true, true],
		[true, false, false],
		[false, true, false],
		[false, false, true],
		[6, 3, -6],
		[null, null, null],
		[5, null, null],
	] as Array<[unknown, unknown, unknown]>)('eqv(%s, %s) is %s', (left, right, expected) => {
		expect(vbsEqv(left, right)).to.equal(expected)
	})

	it.each([
		[true, false],
		[false, true],
		[null, null],
		[5, -6],
		[0, -1],
	] as Array<[unknown, unknown]>)('not(%s) is %s', (value, expected) => {
		expect(vbsNot(value)).to.equal(expected)
	})
})

describe('vbs-values equality', () => {
	it.each([
		[5, 5, true],
		[5, 10, false],
		[true, -1, true],
		[-1, true, true],
		[true, 1, false],
		[false, 0, true],
		['a', 'a', true],
		[0, '', true],
		[5, undefined, false],
	] as Array<[unknown, unknown, boolean]>)('equals(%s, %s) is %s', (left, right, expected) => {
		expect(vbsEquals(left, right)).to.equal(expected)
	})

	it('treats undefined as equal to undefined, missing, or empty', () => {
		expect(vbsEquals(new VbsUndefined(), new VbsUndefined())).to.equal(true)
		expect(vbsEquals(undefined, new VbsUndefined())).to.equal(true)
		expect(vbsEquals(new VbsUndefined(), undefined)).to.equal(true)
		expect(vbsEquals(new VbsUndefined(), '')).to.equal(true)
		expect(vbsEquals('', new VbsUndefined())).to.equal(true)
		expect(vbsEquals(new VbsUndefined(), 5)).to.equal(false)
		expect(vbsEquals(5, new VbsUndefined())).to.equal(false)
	})

	it('yields Null for any comparison with Null', () => {
		expect(vbsEquals(null, null)).to.equal(null)
		expect(vbsEquals(null, 5)).to.equal(null)
		expect(vbsEquals(5, null)).to.equal(null)
		expect(vbsEquals(null, '')).to.equal(null)
		expect(vbsEquals(null, new VbsUndefined())).to.equal(null)
	})

	it.each([
		[null, null, null],
		[null, 5, null],
		[5, null, null],
		[1, 2, true],
		[1, 1, false],
		[true, -1, false],
		[true, 1, true],
		[new VbsUndefined(), '', false],
	] as Array<[unknown, unknown, unknown]>)('notEquals(%s, %s) is %s', (left, right, expected) => {
		expect(vbsNotEquals(left, right)).to.equal(expected)
	})
})

describe('vbs-values integer division', () => {
	it('rounds halves to even', () => {
		expect(bankersRound(2.5)).to.equal(2)
		expect(bankersRound(3.5)).to.equal(4)
		expect(bankersRound(-2.5)).to.equal(-2)
		expect(bankersRound(-3.5)).to.equal(-4)
		expect(bankersRound(0.5)).to.equal(0)
		expect(bankersRound(1.5)).to.equal(2)
	})

	it.each([
		[7, 2, 3],
		[-7, 2, -3],
		[-7, 3, -2],
		[6.8, 3.2, 2],
		[5.5, 2, 3],
		[2.5, 1, 2],
		[3.5, 1, 4],
		[7.5, 2, 4],
	] as Array<[number, number, number]>)('intDiv(%s, %s) is %s', (left, right, expected) => {
		expect(vbsIntDiv(left, right)).to.equal(expected)
	})

	it('yields Null when an operand is Null', () => {
		expect(vbsIntDiv(null, 2)).to.equal(null)
		expect(vbsIntDiv(7, null)).to.equal(null)
	})

	it('raises division by zero for a divisor that rounds to zero', () => {
		try {
			vbsIntDiv(5, 0)
			expect.unreachable('should have raised error 11')
		} catch (e) {
			expect(e).to.be.an.instanceof(VbsError)
			expect((e as VbsError).code).to.equal(11)
		}
	})

	it('records error 11 under On Error Resume Next', () => {
		ERR.OnErrorResumeNext()
		expect(vbsIntDiv(5, 0)).to.equal(undefined)
		expect(ERR.Number).to.equal(11)
	})
})

describe('vbs-values division and modulo', () => {
	it.each([
		[7, 2, 3.5],
		['6', '2', 3],
		[true, 2, -0.5],
		[new VbsUndefined(), 2, 0],
		['&H10', 2, 8],
	] as Array<[unknown, unknown, unknown]>)('div(%s, %s) is %s', (left, right, expected) => {
		expect(vbsDiv(left, right)).to.equal(expected)
	})

	it('yields Null when an operand is Null', () => {
		expect(vbsDiv(null, 2)).to.equal(null)
		expect(vbsDiv(2, null)).to.equal(null)
	})

	it('raises division by zero for a zero divisor', () => {
		try {
			vbsDiv(5, 0)
			expect.unreachable('should have raised error 11')
		} catch (e) {
			expect(e).to.be.an.instanceof(VbsError)
			expect((e as VbsError).code).to.equal(11)
		}
	})

	it('records error 11 under On Error Resume Next', () => {
		ERR.OnErrorResumeNext()
		expect(vbsDiv(5, 0)).to.equal(undefined)
		expect(ERR.Number).to.equal(11)
	})

	it('raises type mismatch for garbage operands', () => {
		ERR.OnErrorResumeNext()
		expect(vbsDiv('a', 1)).to.equal(undefined)
		expect(ERR.Number).to.equal(13)
	})

	it.each([
		[7, 3, 1],
		[-7, 3, -1],
		[5.5, 2, 0],
		['7', '3', 1],
	] as Array<[unknown, unknown, unknown]>)('mod(%s, %s) is %s', (left, right, expected) => {
		expect(vbsMod(left, right)).to.equal(expected)
	})

	it('yields Null when an operand is Null', () => {
		expect(vbsMod(5, null)).to.equal(null)
		expect(vbsMod(null, 5)).to.equal(null)
	})

	it('raises division by zero for a divisor that rounds to zero', () => {
		ERR.OnErrorResumeNext()
		expect(vbsMod(5, 0)).to.equal(undefined)
		expect(ERR.Number).to.equal(11)
		ERR.Clear()
		expect(vbsMod(5, 0.4)).to.equal(undefined)
		expect(ERR.Number).to.equal(11)
	})
})

describe('vbs-values addition', () => {
	it.each([
		[1, 2, 3],
		['1', '2', 3],
		['a', 'b', 'ab'],
		['a', '1', 'a1'],
		[true, true, -2],
		[true, 1, 0],
		[1, '2', 3],
		['&H10', 1, 17],
		['a', new VbsUndefined(), 'a'],
		[new VbsUndefined(), 'a', 'a'],
		[1, new VbsUndefined(), 1],
		[new VbsUndefined(), undefined, 0],
	] as Array<[unknown, unknown, unknown]>)('add(%s, %s) is %s', (left, right, expected) => {
		expect(vbsAdd(left, right)).to.equal(expected)
	})

	it('yields Null when an operand is Null', () => {
		expect(vbsAdd(null, 1)).to.equal(null)
		expect(vbsAdd(1, null)).to.equal(null)
	})

	it('raises type mismatch for a non-numeric string plus a number', () => {
		ERR.OnErrorResumeNext()
		expect(vbsAdd('a', 1)).to.equal(undefined)
		expect(ERR.Number).to.equal(13)
	})

	it('still raises type mismatch when a NaN operand reaches "+"', () => {
		ERR.OnErrorResumeNext()
		expect(vbsAdd(Number.NaN, 1)).to.equal(undefined)
		expect(ERR.Number).to.equal(13)
	})
})

describe('vbs-values subtraction and multiplication', () => {
	it.each([
		[5, 2, 3],
		[5, 7, -2],
		['6', '2', 4],
		[true, 1, -2],
		[false, 1, -1],
		[1, '2', -1],
		['&H10', 1, 15],
		[new VbsUndefined(), 1, -1],
		[1, new VbsUndefined(), 1],
		[new VbsUndefined(), undefined, 0],
		[undefined, undefined, 0],
	] as Array<[unknown, unknown, unknown]>)('sub(%s, %s) is %s', (left, right, expected) => {
		expect(vbsSub(left, right)).to.equal(expected)
	})

	it.each([
		[5, 2, 10],
		['6', '2', 12],
		[true, 2, -2],
		[false, 5, 0],
		[1, '2', 2],
		['&H10', 2, 32],
		[new VbsUndefined(), 2, 0],
		[2, new VbsUndefined(), 0],
		[new VbsUndefined(), undefined, 0],
		[undefined, undefined, 0],
	] as Array<[unknown, unknown, unknown]>)('mul(%s, %s) is %s', (left, right, expected) => {
		expect(vbsMul(left, right)).to.equal(expected)
	})

	it('yields Null when an operand is Null', () => {
		expect(vbsSub(null, 1)).to.equal(null)
		expect(vbsSub(1, null)).to.equal(null)
		expect(vbsMul(null, 2)).to.equal(null)
		expect(vbsMul(2, null)).to.equal(null)
	})

	it('raises type mismatch for garbage operands', () => {
		ERR.OnErrorResumeNext()
		expect(vbsSub('a', 1)).to.equal(undefined)
		expect(ERR.Number).to.equal(13)
		ERR.Clear()
		expect(vbsMul('a', 2)).to.equal(undefined)
		expect(ERR.Number).to.equal(13)
		ERR.Clear()
		expect(vbsSub(Number.NaN, 1)).to.equal(undefined)
		expect(ERR.Number).to.equal(13)
	})

	it('raises overflow for non-finite results', () => {
		ERR.OnErrorResumeNext()
		expect(vbsSub(1e308, -1e308)).to.equal(undefined)
		expect(ERR.Number).to.equal(6)
		ERR.Clear()
		expect(vbsMul(1e308, 10)).to.equal(undefined)
		expect(ERR.Number).to.equal(6)
	})
})

describe('vbs-values concatenation', () => {
	it.each([
		['a', 'b', 'ab'],
		[1, 2, '12'],
		['Score: ', 100, 'Score: 100'],
		[true, false, 'TrueFalse'],
		[undefined, 'x', 'x'],
		['x', new VbsUndefined(), 'x'],
		[new VbsUndefined(), new VbsUndefined(), ''],
	] as Array<[unknown, unknown, unknown]>)('concat(%s, %s) is %s', (left, right, expected) => {
		expect(vbsConcat(left, right)).to.equal(expected)
	})

	it('yields Null when an operand is Null', () => {
		expect(vbsConcat(null, 'a')).to.equal(null)
		expect(vbsConcat('a', null)).to.equal(null)
		expect(vbsConcat(null, null)).to.equal(null)
	})
})

describe('vbs-values ordering comparisons', () => {
	it.each([
		[1, 2, true],
		[2, 1, false],
		['10', '9', true],
		['10', 9, false],
		[true, 0, true],
		[true, -1, false],
		[true, -2, false],
		[false, 1, true],
		[undefined, 1, true],
		[new VbsUndefined(), 0, false],
		[undefined, 'a', true],
		[undefined, '', false],
		['&H10', 17, true],
	] as Array<[unknown, unknown, unknown]>)('lt(%s, %s) is %s', (left, right, expected) => {
		expect(vbsLt(left, right)).to.equal(expected)
	})

	it.each([
		[1, 1, true],
		[2, 1, false],
		[true, -1, true],
		[undefined, 0, true],
	] as Array<[unknown, unknown, unknown]>)('lte(%s, %s) is %s', (left, right, expected) => {
		expect(vbsLte(left, right)).to.equal(expected)
	})

	it.each([
		[2, 1, true],
		[1, 2, false],
		[true, 0, false],
		[true, -2, true],
		[undefined, -1, true],
	] as Array<[unknown, unknown, unknown]>)('gt(%s, %s) is %s', (left, right, expected) => {
		expect(vbsGt(left, right)).to.equal(expected)
	})

	it.each([
		[1, 1, true],
		[1, 2, false],
		[true, -1, true],
		[undefined, 0, true],
	] as Array<[unknown, unknown, unknown]>)('gte(%s, %s) is %s', (left, right, expected) => {
		expect(vbsGte(left, right)).to.equal(expected)
	})

	it('yields Null when an operand is Null', () => {
		expect(vbsLt(null, 1)).to.equal(null)
		expect(vbsLt(1, null)).to.equal(null)
		expect(vbsLte(null, null)).to.equal(null)
		expect(vbsGt(null, 1)).to.equal(null)
		expect(vbsGte(1, null)).to.equal(null)
	})

	it('raises type mismatch for garbage against a number', () => {
		ERR.OnErrorResumeNext()
		expect(vbsLt('a', 1)).to.equal(undefined)
		expect(ERR.Number).to.equal(13)
	})
})

describe('parseNumericText', () => {
	it.each([
		['12', 12],
		['  -12.5 ', -12.5],
		['1e3', 1000],
		['&HFF', 255],
		['&hff', 255],
		['&O17', 15],
	] as Array<[string, number]>)('parses %s as %s', (text, expected) => {
		expect(parseNumericText(text)).to.equal(expected)
	})

	it.each(['', '   ', 'abc', '12abc', '0x1A', '0b11', 'Infinity', 'NaN'])('rejects %s', text => {
		expect(parseNumericText(text)).toBeNaN()
	})
})
