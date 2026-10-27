/** Pure VBScript value semantics: bitwise logic, True is -1, Null propagates, banker's rounding. */

import { ERR, VbsError } from './stdlib/err.js'
import { NOTHING_TAG, UNDEF } from './vbs-undefined.js'

export type VbsLogicResult = number | boolean | null | undefined

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
 * Raises a coercion failure through ERR (throwing, or recording under
 * `On Error Resume Next`); the undefined return is the record-mode result.
 */
function raiseCoercion(code: 5 | 6 | 11 | 13 | 91 | 94, message: string): undefined {
	ERR.Raise(new VbsError(message, code))
	return undefined
}

/**
 * Whether a value is usable in a coercion position. `Nothing` has no
 * numeric/string coercion: like the conversion functions, using it as a
 * value raises "Object variable not set" (91). Returns false in record mode.
 */
function assertNotNothing(value: unknown): boolean {
	if ((value as Record<symbol, unknown> | null | undefined)?.[NOTHING_TAG] === true) {
		ERR.Raise(new VbsError('Object variable not set', 91))
		return false
	}
	return true
}

/**
 * Coerces a value to a 32-bit operand: booleans to -1/0, Empty to 0, numbers
 * via banker's rounding with CLng clamping, numeric strings numerically,
 * objects via Number (honoring valueOf, so Err reads as Err.Number).
 * Garbage (non-numeric text, NaN, symbols, objects without primitive
 * conversion) raises type mismatch (13); Nothing raises 91. Returns
 * undefined when the error was recorded instead of thrown.
 */
function toInt32Operand(value: unknown): number | undefined {
	if (typeof value === 'boolean') {
		return value ? -1 : 0
	}
	if (value === undefined || isVbsUndef(value)) {
		return 0
	}
	if (!assertNotNothing(value)) {
		return undefined
	}
	// Objects with no primitive conversion (and symbols) make Number throw a
	// raw TypeError; those raise type mismatch (13) instead of leaking.
	let numeric: number
	try {
		numeric = typeof value === 'number' ? value : Number(value)
	} catch {
		return raiseCoercion(13, 'Type mismatch')
	}
	if (Number.isNaN(numeric)) {
		return raiseCoercion(13, 'Type mismatch')
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
		const operand = toInt32Operand(other)
		if (operand === undefined) {
			return undefined
		}
		return operand === 0 ? false : null
	}
	const leftOperand = toInt32Operand(left)
	if (leftOperand === undefined) {
		return undefined
	}
	const rightOperand = toInt32Operand(right)
	if (rightOperand === undefined) {
		return undefined
	}
	return leftOperand & rightOperand
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
		const operand = toInt32Operand(other)
		if (operand === undefined) {
			return undefined
		}
		return operand === 0 ? null : true
	}
	const leftOperand = toInt32Operand(left)
	if (leftOperand === undefined) {
		return undefined
	}
	const rightOperand = toInt32Operand(right)
	if (rightOperand === undefined) {
		return undefined
	}
	return leftOperand | rightOperand
}

/** VBS Xor: bitwise; Null always propagates. */
export function vbsXor(left: unknown, right: unknown): VbsLogicResult {
	if (left === null || right === null) {
		return null
	}
	if (typeof left === 'boolean' && typeof right === 'boolean') {
		return left !== right
	}
	const leftOperand = toInt32Operand(left)
	if (leftOperand === undefined) {
		return undefined
	}
	const rightOperand = toInt32Operand(right)
	if (rightOperand === undefined) {
		return undefined
	}
	return leftOperand ^ rightOperand
}

/** VBS Eqv: bitwise equivalence; Null always propagates. */
export function vbsEqv(left: unknown, right: unknown): VbsLogicResult {
	if (left === null || right === null) {
		return null
	}
	if (typeof left === 'boolean' && typeof right === 'boolean') {
		return left === right
	}
	const leftOperand = toInt32Operand(left)
	if (leftOperand === undefined) {
		return undefined
	}
	const rightOperand = toInt32Operand(right)
	if (rightOperand === undefined) {
		return undefined
	}
	return ~(leftOperand ^ rightOperand)
}

/** VBS Not: bitwise complement; Null propagates. */
export function vbsNot(value: unknown): VbsLogicResult {
	if (value === null) {
		return null
	}
	if (typeof value === 'boolean') {
		return !value
	}
	const operand = toInt32Operand(value)
	if (operand === undefined) {
		return undefined
	}
	return ~operand
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
	// Objects with no primitive conversion make Number throw a raw TypeError;
	// those coerce as NaN so the caller raises type mismatch (13) instead.
	try {
		return Number(value)
	} catch {
		return NaN
	}
}

/**
 * VBS `\`: coerces both operands like the other arithmetic operators (True
 * is -1, Empty is 0, `&H` hex included), banker's-rounds them, divides, and
 * truncates toward zero. A Null operand yields Null; garbage raises type
 * mismatch (13); a non-finite operand or a result outside the Long range
 * raises Overflow (6); a divisor that rounds to zero raises Division by zero
 * (11). Under `On Error Resume Next` the error is recorded and the result is
 * undefined (VBScript would leave the assignment target unchanged, which needs
 * statement-level support the callers don't have yet).
 */
export function vbsIntDiv(left: unknown, right: unknown): number | null | undefined {
	if (left === null || right === null) {
		return null
	}
	if (!assertNotNothing(left) || !assertNotNothing(right)) {
		return undefined
	}
	const dividend = toVbsNumber(left)
	const divisor = toVbsNumber(right)
	if (Number.isNaN(dividend) || Number.isNaN(divisor)) {
		return raiseCoercion(13, 'Type mismatch')
	}
	if (!Number.isFinite(dividend) || !Number.isFinite(divisor)) {
		return raiseCoercion(6, 'Overflow')
	}
	const roundedDivisor = bankersRound(divisor)
	if (roundedDivisor === 0) {
		return raiseCoercion(11, 'Division by zero.')
	}
	const result = Math.trunc(bankersRound(dividend) / roundedDivisor)
	if (!Number.isFinite(result) || result < -2147483648 || result > 2147483647) {
		return raiseCoercion(6, 'Overflow')
	}
	return result
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
	if (!assertNotNothing(left) || !assertNotNothing(right)) {
		return undefined
	}
	const dividend = toVbsNumber(left)
	const divisor = toVbsNumber(right)
	if (Number.isNaN(dividend) || Number.isNaN(divisor)) {
		return raiseCoercion(13, 'Type mismatch')
	}
	if (divisor === 0) {
		return raiseCoercion(11, 'Division by zero')
	}
	const result = dividend / divisor
	if (!Number.isFinite(result)) {
		return raiseCoercion(6, 'Overflow')
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
	if (!assertNotNothing(left) || !assertNotNothing(right)) {
		return undefined
	}
	const dividend = toVbsNumber(left)
	const divisor = toVbsNumber(right)
	if (Number.isNaN(dividend) || Number.isNaN(divisor)) {
		return raiseCoercion(13, 'Type mismatch')
	}
	if (!Number.isFinite(dividend) || !Number.isFinite(divisor)) {
		return raiseCoercion(6, 'Overflow')
	}
	const roundedDivisor = bankersRound(divisor)
	if (roundedDivisor === 0) {
		return raiseCoercion(11, 'Division by zero')
	}
	return bankersRound(dividend) % roundedDivisor
}

/**
 * VBS `+`: Null yields Null; Empty coerces to 0 (so `Empty + True` is -1 and
 * `Empty + "abc"` is a type mismatch (13), not a passthrough). Two strings
 * add when both are numeric, else concatenate; anything else adds numerically
 * (True is -1, garbage raises type mismatch (13)). Under `On Error Resume
 * Next` the error is recorded and the result is undefined (see vbsIntDiv).
 */
export function vbsAdd(left: unknown, right: unknown): unknown {
	if (left === null || right === null) {
		return null
	}
	if (!assertNotNothing(left) || !assertNotNothing(right)) {
		return undefined
	}
	const leftEmpty = left === undefined || isVbsUndef(left)
	const rightEmpty = right === undefined || isVbsUndef(right)
	if (leftEmpty && rightEmpty) {
		return 0
	}
	if (leftEmpty || rightEmpty) {
		const leftNumeric = leftEmpty ? 0 : toVbsNumber(left)
		const rightNumeric = rightEmpty ? 0 : toVbsNumber(right)
		if (Number.isNaN(leftNumeric) || Number.isNaN(rightNumeric)) {
			return raiseCoercion(13, 'Type mismatch')
		}
		return vbsCheckedResult(leftNumeric + rightNumeric)
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
		return raiseCoercion(13, 'Type mismatch')
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
	if (!assertNotNothing(left) || !assertNotNothing(right)) {
		return undefined
	}
	const leftNumeric = toVbsNumber(left)
	const rightNumeric = toVbsNumber(right)
	if (Number.isNaN(leftNumeric) || Number.isNaN(rightNumeric)) {
		return raiseCoercion(13, 'Type mismatch')
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
	if (!assertNotNothing(left) || !assertNotNothing(right)) {
		return undefined
	}
	const leftNumeric = toVbsNumber(left)
	const rightNumeric = toVbsNumber(right)
	if (Number.isNaN(leftNumeric) || Number.isNaN(rightNumeric)) {
		return raiseCoercion(13, 'Type mismatch')
	}
	return vbsCheckedResult(leftNumeric * rightNumeric)
}

/**
 * VBS `^`: a Null operand yields Null; operands coerce like the other
 * arithmetic operators (True is -1, Empty is 0, `&H` hex included). Garbage
 * operands raise type mismatch (13), but a NaN result — a negative base to
 * a fractional exponent — raises Invalid procedure call (5) like VBScript,
 * and a non-finite result raises Overflow (6). Under `On Error Resume Next`
 * the error is recorded and the result is undefined (see vbsIntDiv).
 */
export function vbsExponent(base: unknown, exp: unknown): number | null | undefined {
	if (base === null || exp === null) {
		return null
	}
	if (!assertNotNothing(base) || !assertNotNothing(exp)) {
		return undefined
	}
	const baseNumeric = toVbsNumber(base)
	const expNumeric = toVbsNumber(exp)
	if (Number.isNaN(baseNumeric) || Number.isNaN(expNumeric)) {
		return raiseCoercion(13, 'Type mismatch')
	}
	const result = baseNumeric ** expNumeric
	if (Number.isNaN(result)) {
		return raiseCoercion(5, 'Invalid procedure call or argument')
	}
	if (!Number.isFinite(result)) {
		return raiseCoercion(6, 'Overflow')
	}
	return result
}

/**
 * VBS unary `-`: Null yields Null; Empty coerces to 0 and True to -1 like
 * the other arithmetic operators. Garbage raises type mismatch (13) and a
 * non-finite operand raises Overflow (6). Under `On Error Resume Next` the
 * error is recorded and the result is undefined (see vbsIntDiv).
 */
export function vbsNeg(value: unknown): number | null | undefined {
	if (value === null) {
		return null
	}
	if (!assertNotNothing(value)) {
		return undefined
	}
	const numeric = toVbsNumber(value)
	if (Number.isNaN(numeric)) {
		return raiseCoercion(13, 'Type mismatch')
	}
	if (!Number.isFinite(numeric)) {
		return raiseCoercion(6, 'Overflow')
	}
	return numeric === 0 ? 0 : -numeric
}

/** Returns a finite arithmetic result, raising Overflow (6) otherwise. */
function vbsCheckedResult(result: number): number | undefined {
	if (!Number.isFinite(result)) {
		return raiseCoercion(6, 'Overflow')
	}
	return result
}

/**
 * VBS `=`: True compares as -1; Empty (undefined or the Empty sentinel)
 * equals Empty, `''`, 0, and False. Any comparison with Null yields Null
 * (falsy).
 *
 * Known deviation: a plain object with a working primitive conversion
 * compares via JS loose equality (usually false) instead of raising type
 * mismatch (13) the way objects without primitive conversion do. Real
 * VBScript rejects `=` on objects (use `Is`); narrowing this would also
 * reject legitimate `Date`/`Err`/class-instance comparisons that table
 * scripts rely on, so the loose result stands.
 */
export function vbsEquals(left: unknown, right: unknown): boolean | null {
	if (left === null || right === null) {
		return null
	}
	const normalizedLeft = typeof left === 'boolean' ? (left ? -1 : 0) : left
	const normalizedRight = typeof right === 'boolean' ? (right ? -1 : 0) : right
	// Loose equality coerces operands; objects without primitive conversion
	// make it throw a raw TypeError, which surfaces as type mismatch (13).
	let loose = false
	try {
		// biome-ignore lint/suspicious/noDoubleEquals: VBS equals semantics
		loose = normalizedLeft == normalizedRight
	} catch {
		raiseCoercion(13, 'Type mismatch')
		return false
	}
	if (loose) {
		return true
	}
	const leftEmpty = normalizedLeft === undefined || isVbsUndef(normalizedLeft)
	const rightEmpty = normalizedRight === undefined || isVbsUndef(normalizedRight)
	if (leftEmpty && rightEmpty) {
		return true
	}
	if (leftEmpty && (normalizedRight === '' || normalizedRight === 0)) {
		return true
	}
	if (rightEmpty && (normalizedLeft === '' || normalizedLeft === 0)) {
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

/**
 * VBS `&`: Null propagates (any Null operand yields Null), Empty stringifies
 * to `''`, booleans to `True`/`False`, mirroring `CStr` without its Null
 * error so the operator — not the conversion — owns Null.
 */
export function vbsConcat(left: unknown, right: unknown): string | null {
	if (left === null || right === null) {
		return null
	}
	return toConcatText(left) + toConcatText(right)
}

/** Stringifies one `&` operand: Empty is `''`, like `Stdlib.CStr` without the Null error. */
function toConcatText(value: unknown): string {
	if (value === undefined || isVbsUndef(value)) {
		return ''
	}
	if (!assertNotNothing(value)) {
		return ''
	}
	if (typeof value === 'string') {
		return value
	}
	if (typeof value === 'boolean') {
		return value ? 'True' : 'False'
	}
	// Objects without primitive conversion make String throw a raw TypeError;
	// those raise type mismatch (13) instead of leaking.
	try {
		return String(value)
	} catch {
		raiseCoercion(13, 'Type mismatch')
		return ''
	}
}

/**
 * Normalizes one ordering operand: booleans to -1/0, Empty to `''` against a
 * string (string context) or 0 otherwise (numeric context). Null is handled
 * by the caller; non-conforming values fall through for numeric coercion.
 */
function normalizeOrderOperand(value: unknown, otherIsString: boolean): unknown {
	if (value === undefined || isVbsUndef(value)) {
		return otherIsString ? '' : 0
	}
	if (typeof value === 'boolean') {
		return value ? -1 : 0
	}
	return value
}

/**
 * Numeric Variant subtypes for ordering-comparison dispatch: numbers and
 * Dates (booleans already normalize to -1/0 above; Empty normalizes to `''`
 * against a string, else 0). Strings — even numeric text — are not numeric
 * here; whether their text coerces is decided via parseNumericText below.
 */
function isNumericVariant(value: unknown): boolean {
	return typeof value === 'number' || value instanceof Date
}

/**
 * VBS `<`, `<=`, `>`, `>=`: Null yields Null; two strings compare textually.
 * A numeric Variant against a string never raises: numeric text still coerces
 * and compares numerically, otherwise the numeric expression is
 * unconditionally less than the string expression (documented Variant rule,
 * not a type mismatch). Empty and booleans normalize before dispatch (Empty
 * to `''` against a string, else 0; True to -1). Non-numeric, non-string
 * operands (objects without coercion, ...) still coerce numerically and
 * garbage raises type mismatch (13), like the arithmetic operators. Under
 * `On Error Resume Next` the error is recorded and the result is undefined
 * (see vbsIntDiv).
 *
 * @see https://learn.microsoft.com/en-us/office/vba/Language/Reference/user-interface-help/comparison-operators
 * ("One Variant expression is numeric and the other is a string: The numeric
 * expression is less than the string expression.")
 */
function vbsCompare(
	left: unknown,
	right: unknown,
	cmp: (a: number | string, b: number | string) => boolean,
): boolean | null | undefined {
	if (left === null || right === null) {
		return null
	}
	if (!assertNotNothing(left) || !assertNotNothing(right)) {
		return undefined
	}
	const normalizedLeft = normalizeOrderOperand(left, typeof right === 'string')
	const normalizedRight = normalizeOrderOperand(right, typeof left === 'string')
	const leftIsString = typeof normalizedLeft === 'string'
	const rightIsString = typeof normalizedRight === 'string'
	if (leftIsString && rightIsString) {
		return cmp(normalizedLeft, normalizedRight)
	}
	if (leftIsString !== rightIsString) {
		const stringSide = (leftIsString ? normalizedLeft : normalizedRight) as string
		const numericSide = leftIsString ? normalizedRight : normalizedLeft
		if (isNumericVariant(numericSide) && Number.isNaN(parseNumericText(stringSide))) {
			// Non-numeric text: no coercion, no error — the numeric side is less.
			const leftIsLess = !leftIsString
			return leftIsLess ? cmp(0, 1) : cmp(1, 0)
		}
	}
	const leftNumeric = toVbsNumber(normalizedLeft)
	const rightNumeric = toVbsNumber(normalizedRight)
	if (Number.isNaN(leftNumeric) || Number.isNaN(rightNumeric)) {
		return raiseCoercion(13, 'Type mismatch')
	}
	return cmp(leftNumeric, rightNumeric)
}

/** VBS `<`; Null yields Null (falsy). */
export function vbsLt(left: unknown, right: unknown): boolean | null | undefined {
	return vbsCompare(left, right, (a, b) => a < b)
}

/** VBS `<=`; Null yields Null (falsy). */
export function vbsLte(left: unknown, right: unknown): boolean | null | undefined {
	return vbsCompare(left, right, (a, b) => a <= b)
}

/** VBS `>`; Null yields Null (falsy). */
export function vbsGt(left: unknown, right: unknown): boolean | null | undefined {
	return vbsCompare(left, right, (a, b) => a > b)
}

/** VBS `>=`; Null yields Null (falsy). */
export function vbsGte(left: unknown, right: unknown): boolean | null | undefined {
	return vbsCompare(left, right, (a, b) => a >= b)
}
