/** Pure VBScript value semantics: bitwise logic, True is -1, Null propagates, banker's rounding. */

import { ERR, VbsError } from './stdlib/err.js'
import { UNDEF } from './vbs-undefined.js'

export type VbsLogicResult = number | boolean | null

/**
 * Parses a conversion-function string operand: surrounding whitespace is ignored
 * and `&H`/`&O` prefixes parse as hex/octal like VBScript literals. Returns NaN
 * when the text is not a valid VBScript number (empty, garbage, JS-only
 * spellings like `Infinity`, `0x1A`, `0b11`).
 */
export function parseNumericText(text: string): number {
	const trimmed = text.trim()
	if (trimmed === '') {
		return NaN
	}
	if (/^&[hH][0-9a-fA-F]+$/.test(trimmed)) {
		return parseInt(trimmed.slice(2), 16)
	}
	if (/^&[oO][0-7]+$/.test(trimmed)) {
		return parseInt(trimmed.slice(2), 8)
	}
	if (/^[+-]?(Infinity|NaN|0[xX][0-9a-fA-F]+|0[bB][01]+|0[oO][0-7]+)$/.test(trimmed)) {
		return NaN
	}
	return Number(trimmed)
}

/** Banker's rounding, matching Stdlib.CInt/CLng. */
export function bankersRound(value: number): number {
	const truncated = Math.trunc(value)
	if (Math.abs(value - truncated) !== 0.5) {
		return Math.round(value)
	}
	return truncated % 2 === 0 ? truncated : truncated + (value >= 0 ? 1 : -1)
}

/**
 * Banker's-rounds and clamps into [min, max]. For coercing contexts (bitwise
 * operands) only; conversion functions range-check and raise Overflow instead.
 */
export function bankersRoundClamped(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, bankersRound(value)))
}

/**
 * Coerces a value to a 32-bit operand: booleans to -1/0, numbers via banker's
 * rounding with CLng clamping, numeric strings numerically, objects via Number
 * (honoring valueOf, so Err reads as Err.Number); anything else is 0.
 */
function toInt32Operand(value: unknown): number {
	if (typeof value === 'boolean') {
		return value ? -1 : 0
	}
	if (typeof value === 'symbol') {
		return 0
	}
	const numeric = typeof value === 'number' ? value : Number(value)
	if (Number.isNaN(numeric)) {
		return 0
	}
	return bankersRoundClamped(numeric, -2147483648, 2147483647) | 0
}

/** VBS And: bitwise; False wins over Null, otherwise Null propagates. */
export function vbsAnd(left: unknown, right: unknown): VbsLogicResult {
	if (typeof left === 'boolean' && typeof right === 'boolean') {
		return left && right
	}
	if (left === null || right === null) {
		const other = left === null ? right : left
		if (other === null) {
			return null
		}
		if (typeof other === 'boolean') {
			return other ? null : false
		}
		return toInt32Operand(other) === 0 ? false : null
	}
	return toInt32Operand(left) & toInt32Operand(right)
}

/** VBS Or: bitwise; True wins over Null, otherwise Null propagates. */
export function vbsOr(left: unknown, right: unknown): VbsLogicResult {
	if (typeof left === 'boolean' && typeof right === 'boolean') {
		return left || right
	}
	if (left === null || right === null) {
		const other = left === null ? right : left
		if (other === null) {
			return null
		}
		if (typeof other === 'boolean') {
			return other ? true : null
		}
		return toInt32Operand(other) === 0 ? null : true
	}
	return toInt32Operand(left) | toInt32Operand(right)
}

/** VBS Xor: bitwise; Null always propagates. */
export function vbsXor(left: unknown, right: unknown): VbsLogicResult {
	if (left === null || right === null) {
		return null
	}
	if (typeof left === 'boolean' && typeof right === 'boolean') {
		return left !== right
	}
	return toInt32Operand(left) ^ toInt32Operand(right)
}

/** VBS Eqv: bitwise equivalence; Null always propagates. */
export function vbsEqv(left: unknown, right: unknown): VbsLogicResult {
	if (left === null || right === null) {
		return null
	}
	if (typeof left === 'boolean' && typeof right === 'boolean') {
		return left === right
	}
	return ~(toInt32Operand(left) ^ toInt32Operand(right))
}

/** VBS Not: bitwise complement; Null propagates. */
export function vbsNot(value: unknown): VbsLogicResult {
	if (value === null) {
		return null
	}
	if (typeof value === 'boolean') {
		return !value
	}
	return ~toInt32Operand(value)
}

/**
 * Coerces an arithmetic operand to a VBS number: True is -1, numeric strings
 * parse like conversion functions (`&H` hex included), Empty is 0. Garbage
 * yields NaN and the caller raises type mismatch (13).
 */
function toVbsNumber(value: unknown): number {
	if (value === undefined || isVbsUndef(value)) {
		return 0
	}
	if (typeof value === 'boolean') {
		return value ? -1 : 0
	}
	if (typeof value === 'number') {
		return value
	}
	if (typeof value === 'string') {
		return parseNumericText(value)
	}
	return Number(value)
}

/**
 * VBS `\`: banker's-round both operands, divide, truncate toward zero. A Null
 * operand yields Null; a divisor that rounds to zero raises Division by zero
 * (11). Under `On Error Resume Next` the error is recorded and the result is
 * undefined (VBScript would leave the assignment target unchanged, which needs
 * statement-level support the callers don't have yet).
 */
export function vbsIntDiv(left: number | null, right: number | null): number | null | undefined {
	if (left === null || right === null) {
		return null
	}
	const divisor = bankersRound(right)
	if (divisor === 0) {
		ERR.Raise(new VbsError('Division by zero.', 11))
		return undefined
	}
	return Math.trunc(bankersRound(left) / divisor)
}

function isVbsUndef(value: unknown): boolean {
	return !!value && typeof value === 'object' && (value as Record<symbol, unknown>)[UNDEF] === true
}

/**
 * VBS `/`: a Null operand yields Null; a zero divisor raises Division by zero
 * (11) and a non-finite quotient raises Overflow (6). Under `On Error Resume
 * Next` the error is recorded and the result is undefined (see vbsIntDiv).
 */
export function vbsDiv(left: unknown, right: unknown): number | null | undefined {
	if (left === null || right === null) {
		return null
	}
	const dividend = toVbsNumber(left)
	const divisor = toVbsNumber(right)
	if (Number.isNaN(dividend) || Number.isNaN(divisor)) {
		ERR.Raise(new VbsError('Type mismatch', 13))
		return undefined
	}
	if (divisor === 0) {
		ERR.Raise(new VbsError('Division by zero', 11))
		return undefined
	}
	const result = dividend / divisor
	if (!Number.isFinite(result)) {
		ERR.Raise(new VbsError('Overflow', 6))
		return undefined
	}
	return result
}

/**
 * VBS `Mod`: both operands banker's-round to integers first (`5.5 Mod 2` is
 * 0). A Null operand yields Null; a divisor that rounds to zero raises
 * Division by zero (11). Under `On Error Resume Next` the error is recorded
 * and the result is undefined (see vbsIntDiv).
 */
export function vbsMod(left: unknown, right: unknown): number | null | undefined {
	if (left === null || right === null) {
		return null
	}
	const dividend = toVbsNumber(left)
	const divisor = toVbsNumber(right)
	if (Number.isNaN(dividend) || Number.isNaN(divisor)) {
		ERR.Raise(new VbsError('Type mismatch', 13))
		return undefined
	}
	if (!Number.isFinite(dividend) || !Number.isFinite(divisor)) {
		ERR.Raise(new VbsError('Overflow', 6))
		return undefined
	}
	const roundedDivisor = bankersRound(divisor)
	if (roundedDivisor === 0) {
		ERR.Raise(new VbsError('Division by zero', 11))
		return undefined
	}
	return bankersRound(dividend) % roundedDivisor
}

/**
 * VBS `+`: Null yields Null; both Empty yields Integer 0; one Empty returns
 * the other operand unchanged. Two strings add when both are numeric, else
 * concatenate; anything else adds numerically (True is -1, garbage raises
 * type mismatch (13)). Under `On Error Resume Next` the error is recorded
 * and the result is undefined (see vbsIntDiv).
 */
export function vbsAdd(left: unknown, right: unknown): unknown {
	if (left === null || right === null) {
		return null
	}
	const leftEmpty = left === undefined || isVbsUndef(left)
	const rightEmpty = right === undefined || isVbsUndef(right)
	if (leftEmpty && rightEmpty) {
		return 0
	}
	if (leftEmpty) {
		return right
	}
	if (rightEmpty) {
		return left
	}
	if (typeof left === 'string' && typeof right === 'string') {
		const leftNumeric = parseNumericText(left)
		const rightNumeric = parseNumericText(right)
		if (!Number.isNaN(leftNumeric) && !Number.isNaN(rightNumeric)) {
			return vbsCheckedResult(leftNumeric + rightNumeric)
		}
		return left + right
	}
	const leftNumeric = toVbsNumber(left)
	const rightNumeric = toVbsNumber(right)
	if (Number.isNaN(leftNumeric) || Number.isNaN(rightNumeric)) {
		ERR.Raise(new VbsError('Type mismatch', 13))
		return undefined
	}
	return vbsCheckedResult(leftNumeric + rightNumeric)
}

/**
 * VBS `-`: Null yields Null; Empty coerces to 0, True to -1, numeric strings
 * numerically. Garbage raises type mismatch (13) and a non-finite result
 * raises Overflow (6). Under `On Error Resume Next` the error is recorded
 * and the result is undefined (see vbsIntDiv).
 */
export function vbsSub(left: unknown, right: unknown): number | null | undefined {
	if (left === null || right === null) {
		return null
	}
	const leftNumeric = toVbsNumber(left)
	const rightNumeric = toVbsNumber(right)
	if (Number.isNaN(leftNumeric) || Number.isNaN(rightNumeric)) {
		ERR.Raise(new VbsError('Type mismatch', 13))
		return undefined
	}
	return vbsCheckedResult(leftNumeric - rightNumeric)
}

/**
 * VBS `*`: Null yields Null; Empty coerces to 0, True to -1, numeric strings
 * numerically. Garbage raises type mismatch (13) and a non-finite result
 * raises Overflow (6). Under `On Error Resume Next` the error is recorded
 * and the result is undefined (see vbsIntDiv).
 */
export function vbsMul(left: unknown, right: unknown): number | null | undefined {
	if (left === null || right === null) {
		return null
	}
	const leftNumeric = toVbsNumber(left)
	const rightNumeric = toVbsNumber(right)
	if (Number.isNaN(leftNumeric) || Number.isNaN(rightNumeric)) {
		ERR.Raise(new VbsError('Type mismatch', 13))
		return undefined
	}
	return vbsCheckedResult(leftNumeric * rightNumeric)
}

/** Returns a finite arithmetic result, raising Overflow (6) otherwise. */
function vbsCheckedResult(result: number): number | undefined {
	if (!Number.isFinite(result)) {
		ERR.Raise(new VbsError('Overflow', 6))
		return undefined
	}
	return result
}

/**
 * VBS `=`: True compares as -1; undefined equals undefined, missing, or empty
 * string. Any comparison with Null yields Null (falsy).
 */
export function vbsEquals(left: unknown, right: unknown): boolean | null {
	if (left === null || right === null) {
		return null
	}
	const normalizedLeft = typeof left === 'boolean' ? (left ? -1 : 0) : left
	const normalizedRight = typeof right === 'boolean' ? (right ? -1 : 0) : right
	// biome-ignore lint/suspicious/noDoubleEquals: VBS equals semantics
	if (normalizedLeft == normalizedRight) {
		return true
	}
	const leftUndef = isVbsUndef(normalizedLeft)
	const rightUndef = isVbsUndef(normalizedRight)
	if (leftUndef && rightUndef) {
		return true
	}
	if (leftUndef && (normalizedRight === undefined || normalizedRight === '')) {
		return true
	}
	if (rightUndef && (normalizedLeft === undefined || normalizedLeft === '')) {
		return true
	}
	return false
}

/**
 * VBS `<>`: the negation of `vbsEquals`, except any comparison with Null
 * yields Null (falsy) instead of True. The transpiler must call this rather
 * than negating `vbsEquals`, since `!(Null)` is True in JS.
 */
export function vbsNotEquals(left: unknown, right: unknown): boolean | null {
	if (left === null || right === null) {
		return null
	}
	return !vbsEquals(left, right)
}
