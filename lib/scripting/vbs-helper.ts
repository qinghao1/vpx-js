// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { ERR, VbsError } from './stdlib/err.js'
import { isNothing } from './stdlib/index.js'
import type { Transpiler } from './transpiler.js'
import { boundedSet } from './transpiler-worker-pool.js'
import { VbsArray } from './vbs-array.js'
import { UNDEF, VbsUndefined } from './vbs-undefined.js'
import {
	bankersRound,
	type VbsLogicResult,
	vbsAdd,
	vbsAnd,
	vbsConcat,
	vbsDiv,
	vbsEquals,
	vbsEqv,
	vbsExponent,
	vbsGt,
	vbsGte,
	vbsIntDiv,
	vbsLt,
	vbsLte,
	vbsMod,
	vbsMul,
	vbsNeg,
	vbsNot,
	vbsNotEquals,
	vbsOr,
	vbsSub,
	vbsXor,
} from './vbs-values.js'

/**
 * Scratch assignment target for the `Eval` expression fallback. VBScript only
 * parses statements, so a bare expression (`Eval("1+2")`) is retried wrapped
 * as an assignment; `eval` yields the assigned value. The name is scoped to
 * generated code and never referenced by table scripts.
 */
const EVAL_SCRATCH = '__vbsEvalResult'

export class VBSHelper {
	private static readonly UNDEFINED = new VbsUndefined()
	private readonly transpiler: Transpiler
	private transpileCount = 0
	private readonly inlineCache = new Map<string, string>()

	constructor(transpiler: Transpiler) {
		this.transpiler = transpiler
	}

	private isUndef(value: unknown): boolean {
		return value == null || (value as unknown as Record<symbol, unknown>)[UNDEF] === true
	}

	/**
	 * VBScript condition truthiness: Empty (including unread array slots) and
	 * Null are false; anything else follows JS truthiness. Every `If` /
	 * `While` / `Until` test goes through here — a raw `if` would take the
	 * true branch for the UNDEF sentinel object.
	 */
	public isTrue(value: unknown): boolean {
		return !this.isUndef(value) && !!value
	}

	private sourcePrefix(vbs: string, filename?: string): string {
		if (filename) return `//@ sourceURL=game:///${filename}.js\n`
		if (vbs.length > 150) return `//@ sourceURL=game:///inline${this.transpileCount++}.js\n`
		return ''
	}

	public dim(dimensions: number[], pos = 0): any[] {
		if (!dimensions?.length) return new VbsArray<any>([]) as any
		const bound = this.coerceBound(dimensions[pos])
		if (bound === undefined) return new VbsArray<any>([]) as any
		const n = bound + 1
		const arr = new VbsArray<any>(new Array(n).fill(VBSHelper.UNDEFINED))
		if (++pos < dimensions.length) for (let i = 0; i < n; i++) arr[i] = this.dim(dimensions, pos)
		return arr as any
	}

	/**
	 * Coerces a Dim/ReDim bound to a VBS integer: numeric strings numerically,
	 * floats via banker's rounding (like CInt), True as -1, Empty as 0.
	 * Failures route through ERR (13 type mismatch, 94 Null, 9 negative, 7 too
	 * large) so On Error Resume Next records them; returns undefined then.
	 */
	private coerceBound(value: unknown): number | undefined {
		if (value === null) {
			ERR.Raise(new VbsError('Invalid use of Null', 94))
			return undefined
		}
		if (this.isUndef(value)) return 0
		const numeric = typeof value === 'boolean' ? (value ? -1 : 0) : Number(value)
		if (Number.isNaN(numeric)) {
			ERR.Raise(new VbsError('Type mismatch', 13))
			return undefined
		}
		const bound = bankersRound(numeric)
		if (bound < 0) {
			ERR.Raise(new VbsError('Subscript out of range', 9))
			return undefined
		}
		if (!Number.isFinite(bound) || bound > 0x7fffffff) {
			ERR.Raise(new VbsError('Out of memory', 7))
			return undefined
		}
		return bound
	}

	public redim(array: any[], dimensions: number[], preserve = false): any[] {
		const bounds: number[] = []
		for (const raw of dimensions) {
			const bound = this.coerceBound(raw)
			if (bound === undefined) return array
			bounds.push(bound)
		}
		// ReDim redeclares the variable anew: a prior Null holds no array
		// (like Empty from a never-Dim'd variable or a bare `Dim`), so
		// declare one instead of raising 94. There is nothing to preserve
		// then. Genuine Null misuse (Null bounds, CStr(Null), ...) still
		// raises 94 at its own site.
		if (array === null || this.isUndef(array)) {
			return this.dim(bounds)
		}
		let tmp: any = array
		for (let i = 0; i < bounds.length - 1; i++) {
			if (!Array.isArray(tmp) || tmp.length !== bounds[i] + 1) {
				ERR.Raise(new VbsError('Subscript out of range', 9))
				return array
			}
			tmp = tmp[0]
		}
		if (preserve && this.rankOf(array) !== bounds.length) {
			ERR.Raise(new VbsError('Subscript out of range', 9))
			return array
		}
		return preserve ? this.redimResize(array, bounds) : this.dim(bounds)
	}

	/** Array rank (nesting depth); 0 for non-arrays. */
	private rankOf(array: any): number {
		let rank = 0
		let cur: any = array
		while (Array.isArray(cur)) {
			rank++
			cur = cur[0]
		}
		return rank
	}

	public transpileInline(vbs: unknown, filename?: string): string {
		const prep = this.prepareInline(vbs, filename)
		if (prep === undefined) return 'undefined'
		if (prep.cached) return prep.cached
		let js: string
		try {
			js = this.sourcePrefix(prep.text, filename) + this.transpiler.transpile(prep.text)
		} catch {
			try {
				js =
					this.sourcePrefix(prep.text, filename) +
					this.transpiler.transpile(`${EVAL_SCRATCH} = (${prep.text})`)
			} catch (error) {
				this.raiseInline(error)
				return 'undefined'
			}
		}
		this.storeInline(prep.key, js)
		return js
	}

	public async transpileInlineAsync(vbs: unknown, filename?: string): Promise<string> {
		const prep = this.prepareInline(vbs, filename)
		if (prep === undefined) return 'undefined'
		if (prep.cached) return prep.cached
		let js: string
		try {
			js = this.sourcePrefix(prep.text, filename) + (await this.transpiler.transpileAsync(prep.text))
		} catch {
			try {
				js =
					this.sourcePrefix(prep.text, filename) +
					(await this.transpiler.transpileAsync(`${EVAL_SCRATCH} = (${prep.text})`))
			} catch (error) {
				this.raiseInline(error)
				return 'undefined'
			}
		}
		this.storeInline(prep.key, js)
		return js
	}

	/** Shared coerce → cache-lookup head of transpileInline/transpileInlineAsync. */
	private prepareInline(
		vbs: unknown,
		filename?: string,
	): { text: string; key: string; cached: string | undefined } | undefined {
		const text = this.coerceInline(vbs)
		if (text === undefined) return undefined
		const key = filename ?? text
		return { text, key, cached: this.inlineCache.get(key) }
	}

	/** Bound on cached inline snippets; the cache is dropped with its helper. */
	private static readonly MAX_INLINE_CACHE_ENTRIES = 200

	/** Shared cache-store tail of transpileInline/transpileInlineAsync. */
	private storeInline(key: string, js: string): void {
		if (key.length >= 50000) return
		boundedSet(this.inlineCache, key, js, VBSHelper.MAX_INLINE_CACHE_ENTRIES)
	}

	/**
	 * Coerces an `Execute`/`Eval` argument to source text. VBScript converts
	 * scalars implicitly (`Eval(2)` works); Empty is a type mismatch (13),
	 * Null is invalid use (94). Failures route through `ERR` (see coerceBound).
	 */
	private coerceInline(vbs: unknown): string | undefined {
		if (vbs === null) {
			ERR.Raise(new VbsError('Invalid use of Null', 94))
			return undefined
		}
		if (this.isUndef(vbs)) {
			ERR.Raise(new VbsError('Eval requires a string expression, got Empty.', 13))
			return undefined
		}
		const text = typeof vbs === 'string' ? vbs : String(vbs)
		if (text.trim() === '') {
			ERR.Raise(new VbsError('Eval requires a non-empty expression.', 1002))
			return undefined
		}
		return text
	}

	/** Routes an inline-transpile failure through `ERR` (throw or record). */
	private raiseInline(error: unknown): void {
		ERR.Raise(
			error instanceof VbsError
				? error
				: new VbsError(`Cannot evaluate inline script: ${(error as Error).message}`, 1002),
		)
	}

	private redimResize(array: any[], dimensions: number[], pos = 0): any[] {
		// New slots from a grown outer dimension hold no array yet; shape them.
		if (!Array.isArray(array)) {
			return this.dim(dimensions.slice(pos))
		}
		const n = dimensions[pos] + 1
		if (pos === dimensions.length - 1) {
			const oldLength = array.length
			array.length = n
			for (let i = oldLength; i < n; i++) array[i] = VBSHelper.UNDEFINED
			return array
		}
		for (let i = 0; i < n; i++) array[i] = this.redimResize(array[i], dimensions, pos + 1)
		return array
	}

	public erase(array: any[]): any[] {
		const dims: number[] = []
		let cur: any = array
		for (;;) {
			dims.push(cur.length - 1)
			if (!Array.isArray(cur[0])) break
			cur = cur[0]
		}
		return this.dim(dims)
	}

	public toIterable(obj: unknown): Iterable<unknown> {
		if (this.isUndef(obj)) return []
		if (typeof (obj as any)[Symbol.iterator] === 'function') {
			return [...(obj as Iterable<unknown>)]
		}
		if (typeof obj === 'object' && typeof (obj as any).length === 'number') {
			try {
				return Array.from(obj as ArrayLike<unknown>)
			} catch {
				// An exotic length or getter threw a raw TypeError below; fall
				// through to the type mismatch raise.
			}
		}
		ERR.Raise(new VbsError('Type mismatch', 13))
		return []
	}

	public intDiv(left: unknown, right: unknown): number | null | undefined {
		return vbsIntDiv(left, right)
	}

	public exponent(base: unknown, exp: unknown): number | null | undefined {
		return vbsExponent(base, exp)
	}

	public neg(value: unknown): number | null | undefined {
		return vbsNeg(value)
	}

	public add(left: unknown, right: unknown): unknown {
		return vbsAdd(left, right)
	}

	public sub(left: unknown, right: unknown): number | null | undefined {
		return vbsSub(left, right)
	}

	public mul(left: unknown, right: unknown): number | null | undefined {
		return vbsMul(left, right)
	}

	public div(left: unknown, right: unknown): number | null | undefined {
		return vbsDiv(left, right)
	}

	public mod(left: unknown, right: unknown): number | null | undefined {
		return vbsMod(left, right)
	}

	public equals(left: unknown, right: unknown): boolean | null {
		return vbsEquals(left, right)
	}

	public notEquals(left: unknown, right: unknown): boolean | null {
		return vbsNotEquals(left, right)
	}

	public concat(left: unknown, right: unknown): string | null {
		return vbsConcat(left, right)
	}

	public lt(left: unknown, right: unknown): boolean | null | undefined {
		return vbsLt(left, right)
	}

	public lte(left: unknown, right: unknown): boolean | null | undefined {
		return vbsLte(left, right)
	}

	public gt(left: unknown, right: unknown): boolean | null | undefined {
		return vbsGt(left, right)
	}

	public gte(left: unknown, right: unknown): boolean | null | undefined {
		return vbsGte(left, right)
	}

	public is(a: unknown, b: unknown): boolean {
		// Unassigned variables read as undefined/VbsUndefined but VBS treats
		// them as Nothing (`Dim c: c Is Nothing` is True).
		if (isNothing(a) && isNothing(b)) return true
		// `Is` compares object identity; equal primitives (`5 Is 5`) are not
		// objects and must not compare as True.
		if (a === b && a !== null && (typeof a === 'object' || typeof a === 'function')) return true
		return false
	}

	public and(left: unknown, right: unknown): VbsLogicResult {
		return vbsAnd(left, right)
	}
	public or(left: unknown, right: unknown): VbsLogicResult {
		return vbsOr(left, right)
	}
	public xor(left: unknown, right: unknown): VbsLogicResult {
		return vbsXor(left, right)
	}
	public eqv(left: unknown, right: unknown): VbsLogicResult {
		return vbsEqv(left, right)
	}
	public not(value: unknown): VbsLogicResult {
		return vbsNot(value)
	}

	private traverse(obj: unknown, params: unknown[]): unknown {
		for (const param of params) {
			// Dereferencing Null is error 94; a merely unread (Empty) target
			// yields Empty. A terminal Null read yields Null. The member
			// name is included so a real-table failure pinpoints the site.
			if (obj === null) {
				ERR.Raise(new VbsError(`Invalid use of Null: ${String(param)}`, 94))
				return VBSHelper.UNDEFINED
			}
			if (this.isUndef(obj)) return VBSHelper.UNDEFINED
			obj = (obj as Record<string | number, unknown>)[param as string] as unknown
		}
		return obj === undefined || (obj as unknown as Record<symbol, unknown>)?.[UNDEF] === true
			? VBSHelper.UNDEFINED
			: obj
	}

	public getOrCall(obj: unknown, ...params: unknown[]): unknown {
		if (obj === null) {
			ERR.Raise(new VbsError(`Invalid use of Null: ${params.map(String).join(', ')}`, 94))
			return VBSHelper.UNDEFINED
		}
		if (this.isUndef(obj)) return VBSHelper.UNDEFINED
		return this.invokeOrTraverse(obj, obj as object, params)
	}

	public getOrCallBound(
		parent: Record<string, unknown> | null | undefined,
		prop: string,
		...params: unknown[]
	): unknown {
		if (parent === null) {
			ERR.Raise(new VbsError(`Invalid use of Null: ${prop}`, 94))
			return VBSHelper.UNDEFINED
		}
		if (this.isUndef(parent)) return VBSHelper.UNDEFINED
		const value: unknown = (parent as Record<string, unknown>)[prop]
		if (value === null && params.length > 0) {
			ERR.Raise(new VbsError(`Invalid use of Null: ${prop}`, 94))
			return VBSHelper.UNDEFINED
		}
		// A Null variable reads back as Null (not Empty); only unassigned
		// (undefined) and already-Empty reads collapse to the sentinel.
		if (value === undefined || (value as unknown as Record<symbol, unknown>)?.[UNDEF] === true) {
			return VBSHelper.UNDEFINED
		}
		return this.invokeOrTraverse(value, parent as object, params)
	}

	/**
	 * Reads a scope variable without invoking it when it holds a function.
	 *
	 * Traverse-only twin of {@link getOrCallBound} for reference positions —
	 * `Is`/`IsNot` operands — where VBScript compares the reference itself.
	 * A bare read through {@link getOrCallBound} would invoke a function
	 * value with no arguments (e.g. the `Set cb = ...` / `If Not cb Is
	 * Nothing Then cb bstate` solenoid dispatch in core.vbs), yielding
	 * undefined and skipping the guarded call.
	 */
	public getRef(parent: Record<string, unknown> | null | undefined, prop: string): unknown {
		if (parent === null) {
			ERR.Raise(new VbsError(`Invalid use of Null: ${prop}`, 94))
			return VBSHelper.UNDEFINED
		}
		if (this.isUndef(parent)) return VBSHelper.UNDEFINED
		const value: unknown = (parent as Record<string, unknown>)[prop]
		if (value === undefined || (value as unknown as Record<symbol, unknown>)?.[UNDEF] === true) {
			return VBSHelper.UNDEFINED
		}
		return this.traverse(value, [])
	}

	/**
	 * Assignment to a parameterized call target (`X(a) = v`).
	 *
	 * When the member holds a function it is a parameterized `Property Let`
	 * and runs with the assigned value appended (`CallBack(0) = aInput` in
	 * sam.vbs registers the flipper callback); otherwise the value
	 * index-stores exactly like the plain `X[a] = v` form (VPM indexed
	 * properties such as `Controller.Switch(17) = True`, plain arrays).
	 */
	public setOrCall(obj: unknown, prop: string, args: unknown[], value: unknown): unknown {
		if (obj === null) {
			ERR.Raise(new VbsError(`Invalid use of Null: ${prop}`, 94))
			return VBSHelper.UNDEFINED
		}
		if (obj === undefined || this.isUndef(obj)) {
			ERR.Raise(new VbsError(`Object required: ${prop}`, 424))
			return VBSHelper.UNDEFINED
		}
		const target = (obj as Record<string, unknown>)[prop]
		if (typeof target === 'function') {
			return Reflect.apply(target as (...a: unknown[]) => unknown, obj, [...args, value])
		}
		let container = target as Record<PropertyKey, unknown>
		for (let i = 0; i < args.length - 1; i++) {
			container = container[args[i] as PropertyKey] as Record<PropertyKey, unknown>
		}
		container[args[args.length - 1] as PropertyKey] = value
		return value
	}

	private invokeOrTraverse(value: unknown, receiver: object, params: unknown[]): unknown {
		if (typeof value === 'function') {
			if (value === Array) return Array.of(...params)
			return Reflect.apply(value as (...a: unknown[]) => unknown, receiver, params)
		}
		// Default-member call (`Coll(i)`): ICollection.Item is the only
		// DISPID_VALUE in vpinball.idl, so a callable `.Item` is the default
		// member; routing through it keeps native bounds checks (RangeError, native error 9).
		if (params.length > 0) {
			const item = (value as Record<string, unknown> | null | undefined)?.Item
			if (typeof item === 'function') return Reflect.apply(item as (...a: unknown[]) => unknown, value, params)
		}
		return this.traverse(value, params)
	}

	public onErrorResumeNext(): void {
		ERR.OnErrorResumeNext()
	}
	public onErrorGoto(): void {
		ERR.OnErrorGoto0()
	}
}
