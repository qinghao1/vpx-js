// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Player } from '../../game/player.js'
import { logger } from '../../util/logger.js'
import { getObject } from '../objects/index.js'
import { VbsApi } from '../vbs-api.js'
import { NOTHING_TAG, UNDEF, VbsUndefined } from '../vbs-undefined.js'
import { bankersRound, parseNumericText } from '../vbs-values.js'
import { ERR, VbsError } from './err.js'
import { VbsMath } from './math.js'

/**
 * The `Nothing` singleton. Reads of `Empty`/uninitialized variables collapse to
 * the `VbsUndefined` sentinel inside `getOrCall`, so `Nothing` needs a distinct
 * identity for `IsObject`/`TypeName`/`IsEmpty`/`Is` to tell them apart. The
 * `valueOf`/`toString` stubs exist only for JS interop; the VBScript
 * converters (`CStr`, `CInt`, …) and member access raise 91 like VBScript
 * instead of coercing to 0/`''` or silently succeeding.
 */
function createNothing(): object {
	const target = {
		valueOf(): number {
			return 0
		},
		toString(): string {
			return ''
		},
		[NOTHING_TAG]: true,
	}
	return new Proxy(target, {
		get(t, p, _receiver): unknown {
			if (p === 'valueOf' || p === 'toString' || typeof p === 'symbol') {
				return Reflect.get(t, p)
			}
			ERR.Raise(new VbsError('Object variable not set.', 91))
			return new VbsUndefined()
		},
		set(): boolean {
			ERR.Raise(new VbsError('Object variable not set.', 91))
			return true
		},
	})
}

const NOTHING = createNothing()

/**
 * Whether a value counts as `Nothing` for the `Is` operator: the singleton
 * itself, or an unassigned variable (`undefined`/the `VbsUndefined` sentinel —
 * VBS `Dim c: c Is Nothing` is True). `Null` is deliberately excluded: it is a
 * distinct value, not an unassigned variable.
 */
export function isNothing(value: unknown): boolean {
	return (
		value === undefined ||
		value === NOTHING ||
		(value as unknown as Record<symbol, unknown> | null | undefined)?.[UNDEF] === true
	)
}

/** VBS stdlib. */
export class Stdlib extends VbsApi {
	private readonly math = new VbsMath()

	get Empty() {
		return undefined
	}
	get Nothing() {
		return NOTHING
	}
	get Null() {
		return null
	}

	get Err() {
		return ERR
	}
	get Math() {
		return this.math
	}

	get ScriptEngine() {
		return 'VBScript'
	}
	get ScriptEngineMajorVersion() {
		return 5
	}
	get ScriptEngineMinorVersion() {
		return 0
	}
	get ScriptEngineBuildVersion() {
		return 0
	}

	get vbCr() {
		return '\x0d'
	}
	get vbCrLf() {
		return '\x0d\x0a'
	}
	get vbFormFeed() {
		return '\x0c'
	}
	get vbLf() {
		return '\x0a'
	}
	get vbNewLine() {
		return '\n'
	}
	get vbNullChar() {
		return '\x00'
	}
	get vbNullString() {
		return null
	}
	get vbTab() {
		return '\x09'
	}
	get vbVerticalTab() {
		return '\x0b'
	}

	public Abs(n: number): number {
		return Math.abs(n)
	}

	public CBool(v: any): boolean {
		const early = this.conversionHead(v, false)
		if (early !== undefined) return early
		if (typeof v === 'boolean') return v
		if (typeof v === 'number') return v !== 0
		if (typeof v === 'string') {
			const trimmed = v.trim().toLowerCase()
			if (trimmed === 'true') return true
			if (trimmed === 'false') return false
			// Empty text is not a boolean: parseNumericText yields NaN, raising 13 like CInt("").
			const numeric = parseNumericText(v)
			if (!Number.isNaN(numeric)) return numeric !== 0
			ERR.Raise(new VbsError('Type mismatch', 13))
			return false
		}
		return !!v
	}

	private isUndef(value: unknown): boolean {
		return value == null || (value as unknown as Record<symbol, unknown>)[UNDEF] === true
	}

	private text(value: unknown, fallback = ''): string {
		return this.isUndef(value) ? fallback : this.CStr(value)
	}

	/**
	 * Coerces a numeric-conversion operand: True is -1, strings parse like
	 * VBScript numbers. Null/Empty/Nothing are handled by `convertNumber`
	 * before this runs. NaN means the caller raises type mismatch (13), as
	 * does an object without primitive conversion (whose Number throws).
	 */
	private toConverterNumber(v: unknown): number {
		if (typeof v === 'boolean') return v ? -1 : 0
		if (typeof v === 'number') return v
		if (typeof v === 'string') return parseNumericText(v)
		try {
			return Number(v)
		} catch {
			return NaN
		}
	}

	/** Range-checks a rounded integer conversion, raising Overflow (6). */
	private checkOverflow(rounded: number, min: number, max: number): boolean {
		if (rounded < min || rounded > max) {
			ERR.Raise(new VbsError('Overflow', 6))
			return false
		}
		return true
	}

	/**
	 * Shared conversion-function head: Null raises 94, Empty yields the type's
	 * empty value, and Nothing raises 91. Returns undefined when `v` is a real
	 * value and conversion should proceed.
	 */
	private conversionHead<T extends number | string | boolean>(v: unknown, empty: T): T | undefined {
		if (v === null) {
			ERR.Raise(new VbsError('Invalid use of Null', 94))
			return empty
		}
		if (this.isUndef(v)) return empty
		// Tag, not singleton identity: any Nothing-tagged value counts, like
		// `assertNotNothing` in vbs-values.ts and CStr before it.
		if ((v as Record<symbol, unknown> | null | undefined)?.[NOTHING_TAG] === true) {
			ERR.Raise(new VbsError('Object variable not set', 91))
			return empty
		}
		return undefined
	}

	/**
	 * Shared numeric-conversion head (CByte..CCur): the conversionHead guards
	 * plus primitive coercion, where garbage raises type mismatch (13).
	 * Returns undefined when the error was recorded instead of thrown.
	 */
	private convertNumber(v: unknown): number | undefined {
		const early = this.conversionHead(v, 0)
		if (early !== undefined) return early
		const n = this.toConverterNumber(v)
		if (Number.isNaN(n)) {
			ERR.Raise(new VbsError('Type mismatch', 13))
			return undefined
		}
		return n
	}

	public CByte(v: any): number {
		const n = this.convertNumber(v)
		if (n === undefined) return 0
		const rounded = bankersRound(n)
		if (!this.checkOverflow(rounded, 0, 255)) return 0
		return rounded
	}

	public CInt(v: any): number {
		const n = this.convertNumber(v)
		if (n === undefined) return 0
		const rounded = bankersRound(n)
		if (!this.checkOverflow(rounded, -32768, 32767)) return 0
		return rounded | 0
	}

	public CLng(v: any): number {
		const n = this.convertNumber(v)
		if (n === undefined) return 0
		const rounded = bankersRound(n)
		if (!this.checkOverflow(rounded, -2147483648, 2147483647)) return 0
		return rounded | 0
	}

	public CSng(v: any): number {
		const n = this.convertNumber(v)
		if (n === undefined) return 0
		if (!Number.isFinite(n) || Math.abs(n) > 3.402823567e38) {
			ERR.Raise(new VbsError('Overflow', 6))
			return 0
		}
		return Math.fround(n)
	}

	public CDbl(v: any): number {
		const n = this.convertNumber(v)
		if (n === undefined) return 0
		if (!Number.isFinite(n)) {
			ERR.Raise(new VbsError('Overflow', 6))
			return 0
		}
		return n
	}

	public CStr(v: any): string {
		// NB: explicit CStr(Null) is error 94; `&` no longer routes through
		// here but through `__vbs.concat`, which propagates Null instead.
		const early = this.conversionHead(v, '')
		if (early !== undefined) return early
		if (typeof v === 'string') return v
		if (typeof v === 'boolean') return v ? 'True' : 'False'
		// Objects without primitive conversion make String throw a raw
		// TypeError; those raise type mismatch (13) instead of leaking.
		try {
			return String(v)
		} catch {
			ERR.Raise(new VbsError('Type mismatch', 13))
			return ''
		}
	}

	public CDate(v: any): Date | string {
		const early = this.conversionHead(v, '')
		if (early !== undefined) return early
		let input: string
		try {
			input = String(v).trim().replace(/^#|#$/g, '')
		} catch {
			ERR.Raise(new VbsError('Type mismatch', 13))
			return ''
		}
		const date = new Date(input)
		if (isNaN(date.getTime())) {
			ERR.Raise(new VbsError('Type mismatch', 13))
			return ''
		}
		return date
	}

	public CCur(v: any): number {
		const n = this.convertNumber(v)
		if (n === undefined) return 0
		if (!Number.isFinite(n) || Math.abs(n) > 922337203685477.5807) {
			ERR.Raise(new VbsError('Overflow', 6))
			return 0
		}
		return Math.round(n * 10000) / 10000
	}

	public Round(value: number, decimals = 0): number {
		const factor = 10 ** Math.trunc(Number(decimals) || 0)
		return bankersRound(Number(value) * factor) / factor
	}

	public Cos(n: number): number {
		return Math.cos(n)
	}

	public Int(n: number): number {
		return Math.floor(n)
	}

	public Sin(n: number): number {
		return Math.sin(n)
	}

	public Sqr(n: number): number {
		return Math.sqrt(n)
	}

	public UBound(a: unknown, dimension?: unknown): number {
		if (this.isUndef(a)) return -1
		if (dimension === null) {
			ERR.Raise(new VbsError('Invalid use of Null', 94))
			return -1
		}
		const dim = this.isUndef(dimension) ? 1 : bankersRound(Number(dimension))
		if (Number.isNaN(dim)) {
			ERR.Raise(new VbsError('Type mismatch', 13))
			return -1
		}
		if (!Number.isFinite(dim) || dim < 1) {
			ERR.Raise(new VbsError('Subscript out of range', 9))
			return -1
		}
		let current: unknown = a
		for (let level = 1; level < dim; level++) {
			const nested: unknown = (current as Record<number, unknown>)[0]
			if (!Array.isArray(nested)) {
				ERR.Raise(new VbsError('Subscript out of range', 9))
				return -1
			}
			current = nested
		}
		try {
			const len = (current as any).length
			return typeof len === 'number' ? len - 1 : -1
		} catch {
			return -1
		}
	}

	public LBound(_a: unknown, _dimension?: number): number {
		return 0
	}

	public IsArray(obj: any): boolean {
		return Array.isArray(obj)
	}

	public IsEmpty(v: any): boolean {
		return v === undefined || (v as any)?.[UNDEF] === true
	}

	public IsObject(v: any): boolean {
		return v !== null && typeof v === 'object' && (v as any)?.[UNDEF] !== true
	}

	public IsNull(v: any): boolean {
		return v === null
	}

	public IsNumeric(value: unknown): boolean {
		if (this.isUndef(value)) return false
		if (typeof value === 'boolean') return true
		if (typeof value === 'number') return !Number.isNaN(value)
		if (value instanceof Date) return true
		if (typeof value !== 'string') return false
		const text = value.trim()
		if (text === '') return false
		return Number.isFinite(parseNumericText(text))
	}

	public Randomize(): void {
		// Initializes the random-number generator in VBScript. Nothing to initialize here.
	}

	// Stub: VBScript's optional argument reseeds (negative) or repeats (zero)
	// the sequence; we always return the next Math.random() value instead.
	public Rnd(_n?: number): number {
		return Math.random()
	}

	public Atn(n: number): number {
		return Math.atan(n)
	}

	public Tan(n: number): number {
		return Math.tan(n)
	}

	public Exp(n: number): number {
		return Math.exp(n)
	}

	public Log(n: number): number {
		return Math.log(n)
	}

	public Sgn(n: number): number {
		return n > 0 ? 1 : n < 0 ? -1 : 0
	}

	public Fix(n: number): number {
		return Math.trunc(n)
	}

	public Hex(n: number): string {
		return (Math.trunc(n) >>> 0).toString(16).toUpperCase()
	}

	public Oct(n: number): string {
		return (Math.trunc(n) >>> 0).toString(8)
	}

	public SetLocale(_lcid: number): void {}

	public GetRef(proc: string, scope: any): any {
		return scope[proc]
	}

	public TypeName(obj: any): string {
		// NB: the Nothing check reads no properties; member access on it raises 91.
		if (obj === NOTHING) {
			return 'Nothing'
		}
		if (obj === null) {
			return 'Null'
		}
		if (typeof obj === 'undefined' || (obj as any)?.[UNDEF] === true) {
			return 'Empty'
		}
		if (typeof obj === 'string') {
			return 'String'
		}
		if (Number.isInteger(obj)) {
			return 'Integer'
		}
		if (typeof obj === 'number') {
			return 'Double'
		}
		if (typeof obj === 'boolean') {
			return 'Boolean'
		}
		if (obj?.constructor?.name) {
			if (obj.constructor.name === 'BallApi') {
				return 'IBall'
			}
			if (obj.constructor.name.endsWith('Api')) {
				return obj.constructor.name.slice(0, -3)
			}
			return obj.constructor.name
		}
		if (typeof obj === 'object') {
			return 'Object'
		}
		return 'Unknown'
	}

	public RGB(r: number, g: number, b: number) {
		return (r << 16) + (g << 8) + b
	}

	public InStr(first: unknown, second: unknown, third?: unknown, compare?: unknown): number | null {
		let start = 1
		let searched: unknown = first
		let sought: unknown = second
		let textCompare: unknown = compare
		if (third !== undefined) {
			if (compare !== undefined || typeof first === 'number' || typeof first === 'boolean') {
				start = Math.trunc(Number(first))
				searched = second
				sought = third
			} else {
				// InStr(string1, string2, compare): a non-numeric first argument
				// means the start was omitted.
				textCompare = third
			}
		}
		if (searched === null || sought === null) return null
		const haystack = this.text(searched)
		const needle = this.text(sought)
		if (haystack === '') return 0
		if (needle === '') return start
		if (start < 1 || start > haystack.length) return 0
		const position =
			Number(textCompare) === 1
				? haystack.toLowerCase().indexOf(needle.toLowerCase(), start - 1)
				: haystack.indexOf(needle, start - 1)
		return position === -1 ? 0 : position + 1
	}

	public InStrRev(string1: unknown, string2: unknown, start: unknown = -1): number | null {
		if (string1 === null || string2 === null || start === null) return null
		const s1 = this.isUndef(string1) ? '' : this.CStr(string1)
		const s2 = this.isUndef(string2) ? '' : this.CStr(string2)
		if (s1 === '') return 0
		const from = start === undefined ? -1 : Math.trunc(Number(start))
		if (s2 === '') return from === -1 ? s1.length : from
		if (from > s1.length) return 0
		const pos = from === -1 ? s1.lastIndexOf(s2) : s1.substring(0, from).lastIndexOf(s2)
		return pos === -1 ? 0 : pos + 1
	}

	public Len(str: unknown): number | null {
		if (str === null) return null
		if (this.isUndef(str)) return 0
		try {
			return this.CStr(str).length
		} catch {
			return 0
		}
	}

	public Left(str: unknown, length: number): string | null {
		if (str === null || length === null) return null
		if (this.isUndef(str)) return ''
		const s = this.CStr(str)
		if (length <= 0) return ''
		if (length >= s.length) return s
		return s.slice(0, length)
	}

	public Right(str: unknown, length: number): string | null {
		if (str === null || length === null) return null
		if (this.isUndef(str)) return ''
		const s = this.CStr(str)
		if (length <= 0) return ''
		if (length >= s.length) return s
		return s.slice(s.length - length)
	}

	public Mid(str: unknown, start: number, length?: number): string | null {
		if (str === null || start === null || length === null) return null
		if (this.isUndef(str)) return ''
		const s = this.CStr(str)
		const i = Math.max(0, start - 1)
		if (length == null) return s.slice(i)
		if (length <= 0) return ''
		return s.slice(i, i + length)
	}

	public UCase(value: unknown): string | null {
		if (value === null) return null
		return this.text(value).toUpperCase()
	}

	public LCase(value: unknown): string | null {
		if (value === null) return null
		return this.text(value).toLowerCase()
	}

	public Trim(value: unknown): string | null {
		if (value === null) return null
		return this.text(value).replace(/^ +| +$/g, '')
	}

	public Split(expression: unknown, delimiter: unknown = ' ', count?: unknown, compare?: unknown): string[] | null {
		if (expression === null || delimiter === null || count === null || compare === null) return null
		if (this.isUndef(expression)) return []
		const text = this.CStr(expression)
		if (text === '') return []
		const separator = this.text(delimiter, ' ')
		if (separator === '') return [text]
		const textual = Number(compare) === 1
		const limit = this.isUndef(count) ? -1 : Math.trunc(Number(count))
		const source = textual ? text.toLowerCase() : text
		const pattern = textual ? separator.toLowerCase() : separator
		const parts: string[] = []
		let begin = 0
		while (limit < 0 || parts.length < limit - 1) {
			const at = source.indexOf(pattern, begin)
			if (at === -1) break
			parts.push(text.slice(begin, at))
			begin = at + pattern.length
		}
		parts.push(text.slice(begin))
		return parts
	}

	public Join(list: unknown, delimiter: unknown = ' '): string | null {
		if (list === null || delimiter === null) return null
		if (this.isUndef(list)) return ''
		const separator = this.text(delimiter, ' ')
		if (!Array.isArray(list)) return this.CStr(list)
		return list.map(entry => this.text(entry)).join(separator)
	}

	public Replace(
		expression: unknown,
		find: unknown,
		replacement: unknown,
		start?: unknown,
		count?: unknown,
		compare?: unknown,
	): string | null {
		if (
			expression === null ||
			find === null ||
			replacement === null ||
			start === null ||
			count === null ||
			compare === null
		)
			return null
		if (this.isUndef(expression)) return ''
		const text = this.CStr(expression)
		const sought = this.text(find)
		if (text === '' || sought === '') return text
		const substitute = this.text(replacement)
		const from = this.isUndef(start) ? 1 : Math.trunc(Number(start))
		if (from < 1 || from > text.length) return ''
		let remaining = this.isUndef(count) ? -1 : Math.trunc(Number(count))
		if (remaining === 0) return text
		const textual = Number(compare) === 1
		const source = textual ? text.toLowerCase() : text
		const pattern = textual ? sought.toLowerCase() : sought
		let result = ''
		let begin = from - 1
		for (;;) {
			if (remaining === 0) break
			const at = source.indexOf(pattern, begin)
			if (at === -1) break
			result += text.slice(begin, at) + substitute
			begin = at + pattern.length
			if (remaining > 0) remaining -= 1
		}
		return result + text.slice(begin)
	}

	public Chr(charcode: number): string {
		return String.fromCharCode(charcode)
	}

	public Asc(value: unknown): number {
		const text = this.text(value)
		return text === '' ? 0 : text.charCodeAt(0)
	}

	public CreateObject(name: string, player: Player): any {
		return getObject(name, player)
	}

	public MsgBox(msg: string): void {
		logger().warn(`[MsgBox] ${msg}`)
	}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(Stdlib.prototype)
	}
}
