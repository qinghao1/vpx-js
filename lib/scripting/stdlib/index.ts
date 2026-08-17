// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Player } from '../../game/player.js'
import { logger } from '../../util/logger.js'
import { getObject } from '../objects/index.js'
import { VbsApi } from '../vbs-api.js'
import { UNDEF } from '../vbs-undefined.js'
import { ERR } from './err.js'
import { VbsMath } from './math.js'

/** VBS stdlib. */
export class Stdlib extends VbsApi {
	private readonly math = new VbsMath()

	get Empty() {
		return undefined
	}
	get Nothing() {
		return undefined
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
		if (v == null || (v as any)?.[UNDEF] === true) return false
		if (typeof v === 'boolean') return v
		if (typeof v === 'number') return v !== 0
		if (typeof v === 'string') {
			const trimmed = v.trim().toLowerCase()
			if (trimmed === 'true') return true
			if (trimmed === 'false' || trimmed === '') return false
			const numeric = Number(v)
			if (!isNaN(numeric)) return numeric !== 0
			return !!v
		}
		return !!v
	}

	private bankersRound(value: number): number {
		const truncated = Math.trunc(value)
		if (Math.abs(value - truncated) !== 0.5) return Math.round(value)
		return truncated % 2 === 0 ? truncated : truncated + (value >= 0 ? 1 : -1)
	}

	public CByte(v: any): number {
		if (v == null || (v as any)?.[UNDEF] === true) return 0
		const n = Number(v)
		if (isNaN(n)) return 0
		const rounded = this.bankersRound(n)
		return Math.max(0, Math.min(255, rounded))
	}

	public CInt(v: any): number {
		if (v == null || (v as any)?.[UNDEF] === true) return 0
		const n = Number(v)
		if (isNaN(n)) return 0
		const rounded = this.bankersRound(n)
		return Math.max(-32768, Math.min(32767, rounded)) | 0
	}

	public CLng(v: any): number {
		if (v == null || (v as any)?.[UNDEF] === true) return 0
		const n = Number(v)
		if (isNaN(n)) return 0
		const rounded = this.bankersRound(n)
		return Math.max(-2147483648, Math.min(2147483647, rounded)) | 0
	}

	public CSng(v: any): number {
		if (v == null || (v as any)?.[UNDEF] === true) return 0
		const n = Number(v)
		return isNaN(n) ? 0 : Math.fround(n)
	}

	public CDbl(v: any): number {
		if (v == null || (v as any)?.[UNDEF] === true) return 0
		const n = Number(v)
		return isNaN(n) ? 0 : n
	}

	public CStr(v: any): string {
		if (v == null || (v as any)?.[UNDEF] === true) return ''
		if (typeof v === 'string') return v
		if (typeof v === 'boolean') return v ? 'True' : 'False'
		return String(v)
	}

	public CDate(v: any): Date | string {
		if (v == null || (v as any)?.[UNDEF] === true) return ''
		try {
			const input = String(v).trim().replace(/^#|#$/g, '')
			const date = new Date(input)
			return isNaN(date.getTime()) ? String(v) : date
		} catch {
			return String(v)
		}
	}

	public CCur(v: any): number {
		if (v == null || (v as any)?.[UNDEF] === true) return 0
		const n = Number(v)
		if (isNaN(n)) return 0
		return Math.round(n * 10000) / 10000
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

	public UBound(a: unknown, _dimension?: number): number {
		if (a == null || (a as any)?.[UNDEF] === true) return -1
		try {
			const len = (a as any).length
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
		return typeof v === 'undefined' || v === null || (v as any)?.[UNDEF] === true
	}

	public IsObject(v: any): boolean {
		return typeof v === 'object'
	}

	public Randomize(): void {
		// Initializes the random-number generator in VBScript. Nothing to initialize here.
	}

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
		return n >= 0 ? Math.floor(n) : Math.ceil(n)
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
		if ((obj as any)?.[UNDEF] === true) {
			return 'Nothing'
		}
		if (typeof obj === 'string') {
			return 'String'
		}
		if (obj === null) {
			return 'Null'
		}
		if (typeof obj === 'undefined') {
			return 'Nothing'
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
				return obj.constructor.name.slice(0, obj.constructor.name.length - 3)
			}
			if (obj.constructor.name === 'VbsUndefined') {
				return 'Nothing'
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

	public InStrRev(string1: string, string2: string, start: number = -1): any {
		if (string1 === '') return 0
		if (string1 === null) return null
		if (string2 === '') return start === -1 ? string1.length : start
		if (string2 === null) return null
		if (start > string1.length) return 0
		const pos = start === -1 ? string1.lastIndexOf(string2) : string1.substring(0, start).lastIndexOf(string2)
		return pos === -1 ? 0 : pos + 1
	}

	public Len(str: unknown): number {
		if (str == null || (str as any)?.[UNDEF] === true) return 0
		try {
			return String(str).length
		} catch {
			return 0
		}
	}

	public Left(str: unknown, length: number): string {
		if (str == null || (str as any)?.[UNDEF] === true) return ''
		const s = String(str)
		if (length <= 0) return ''
		if (length >= s.length) return s
		return s.slice(0, length)
	}

	public Right(str: unknown, length: number): string {
		if (str == null || (str as any)?.[UNDEF] === true) return ''
		const s = String(str)
		if (length <= 0) return ''
		if (length >= s.length) return s
		return s.slice(s.length - length)
	}

	public Mid(str: unknown, start: number, length?: number): string {
		if (str == null || (str as any)?.[UNDEF] === true) return ''
		const s = String(str)
		const i = Math.max(0, start - 1)
		if (length == null) return s.slice(i)
		if (length <= 0) return ''
		return s.slice(i, i + length)
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
