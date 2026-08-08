// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { logger } from '../util/logger.js'
import { ERR } from './stdlib/err.js'
import type { Transpiler } from './transpiler.js'
import { VbsArray } from './vbs-array.js'
import { VbsUndefined } from './vbs-undefined.js'

/** VBS runtime helpers. */
export class VBSHelper {
	private static readonly UNDEFINED = new VbsUndefined()
	private readonly transpiler: Transpiler
	private transpileCount = 0
	private readonly inlineCache = new Map<string, string>()

	constructor(transpiler: Transpiler) {
		this.transpiler = transpiler
	}

	public dim(dimensions: number[], pos = 0): any[] {
		const n = dimensions?.length ? dimensions[pos] + 1 : 0
		const arr = new VbsArray(new Array(n).fill(VBSHelper.UNDEFINED))
		if (++pos < dimensions.length)
			for (let i = 0; i < n; i++) (arr as unknown as unknown[])[i] = this.dim(dimensions, pos)
		return arr as any
	}

	public redim(array: any[], dimensions: number[], preserve = false): any[] {
		let tmp: unknown = array
		for (let i = 0; i < dimensions.length - 1; i++) {
			if ((tmp as unknown as unknown[]).length !== dimensions[i] + 1)
				throw new Error('Only last dimension can be changed')
			tmp = (tmp as unknown as unknown[])[0]
		}
		return preserve ? this.redimResize(array as any, dimensions) : this.dim(dimensions)
	}

	public transpileInline(vbs: string, filename?: string): string {
		const key = filename ?? vbs
		const cached = this.inlineCache.get(key)
		if (cached) return cached
		let prefix = ''
		if (filename) prefix = `//@ sourceURL=game:///${filename}.js\n`
		else if (vbs.length > 150) prefix = `//@ sourceURL=game:///inline${this.transpileCount++}.js\n`
		const js = prefix + this.transpiler.transpile(vbs)
		if (key.length < 50000) this.inlineCache.set(key, js)
		return js
	}

	public async transpileInlineAsync(vbs: string, filename?: string): Promise<string> {
		const key = filename ?? vbs
		const cached = this.inlineCache.get(key)
		if (cached) return cached
		let prefix = ''
		if (filename) prefix = `//@ sourceURL=game:///${filename}.js\n`
		else if (vbs.length > 150) prefix = `//@ sourceURL=game:///inline${this.transpileCount++}.js\n`
		const js = prefix + await this.transpiler.transpileAsync(vbs)
		if (key.length < 50000) this.inlineCache.set(key, js)
		return js
	}

	private redimResize(array: any[], dimensions: number[], pos = 0): any[] {
		const n = dimensions[pos] + 1
		if (pos === dimensions.length - 1) (array as unknown as unknown[]).length = n
		if (++pos < dimensions.length)
			for (let i = 0; i < n; i++) (array as any[])[i] = this.redimResize((array as any[])[i], dimensions, pos)
		return array
	}

	public erase(array: any[]): any[] {
		const dims: number[] = []
		let cur: unknown = array
		for (;;) {
			dims.push((cur as unknown as unknown[]).length - 1)
			if (!Array.isArray((cur as unknown as unknown[])[0])) break
			cur = (cur as unknown as unknown[])[0]
		}
		return this.dim(dims)
	}

	public toIterable(obj: unknown): Iterable<unknown> {
		if (obj == null) return []
		const anyObj = obj as any
		if (anyObj.__isUndefined) return []
		if (typeof anyObj[Symbol.iterator] === 'function') {
			try {
				const it = anyObj[Symbol.iterator]()
				if (it && typeof it.next === 'function') return anyObj as Iterable<unknown>
			} catch {}
		}
		if (Array.isArray(anyObj)) return anyObj as Iterable<unknown>
		if (typeof anyObj === 'object' && 'length' in anyObj && typeof anyObj.length === 'number') {
			try { return Array.from(anyObj as ArrayLike<unknown>) } catch {}
		}
		return []
	}

	public intDiv(a: number, b: number): number {
		return Math.floor(Math.floor(a) / Math.floor(b))
	}
	public exponent(b: number, e: number): number {
		return b ** e
	}

	public equals(a: unknown, b: unknown): boolean {
		if (a == b) return true
		const u1 = typeof a === 'object' && (a as unknown as Record<string, unknown>).__isUndefined,
			u2 = typeof b === 'object' && (b as unknown as Record<string, unknown>).__isUndefined
		if (u1 && typeof b === 'undefined') return true
		if (typeof a === 'undefined' && u2) return true
		if (u1 && u2) return true
		if (u1 && b === '') return true
		if (a === '' && u2) return true
		return false
	}

	public is(a: unknown, b: unknown): boolean {
		return a === b
	}

	public getOrCall(obj: unknown, ...params: unknown[]): unknown {
		if (obj == null) return VBSHelper.UNDEFINED
		if ((obj as any).__isUndefined) return VBSHelper.UNDEFINED
		if (typeof obj === 'function') {
			if (obj === Array) {
				try {
					return (Array as unknown as { of: (...a: unknown[]) => unknown[] }).of(...params)
				} catch {
					return VBSHelper.UNDEFINED
				}
			}
			try {
				return (obj as (...a: unknown[]) => unknown).bind(obj as object)(...params)
			} catch {
				return VBSHelper.UNDEFINED
			}
		}
		for (const p of params) {
			if (obj == null) return VBSHelper.UNDEFINED
			if ((obj as any).__isUndefined) return VBSHelper.UNDEFINED
			try {
				obj = (obj as Record<string | number, unknown>)[p as string] as unknown
			} catch {
				return VBSHelper.UNDEFINED
			}
			if ((obj as any)?.__isUndefined) return VBSHelper.UNDEFINED
		}
		return (obj as any)?.__isUndefined ? VBSHelper.UNDEFINED : (obj ?? VBSHelper.UNDEFINED)
	}

	public getOrCallBound(
		parent: Record<string, unknown> | null | undefined,
		prop: string,
		...params: unknown[]
	): unknown {
		if (parent == null) return VBSHelper.UNDEFINED
		if ((parent as any).__isUndefined) return VBSHelper.UNDEFINED
		let o: unknown
		try {
			o = (parent as Record<string, unknown>)[prop]
		} catch {
			return VBSHelper.UNDEFINED
		}
		if (o == null) return VBSHelper.UNDEFINED
		if ((o as any).__isUndefined) return VBSHelper.UNDEFINED
		if (typeof o === 'function') {
			if (o === Array) {
				try {
					return (Array as unknown as { of: (...a: unknown[]) => unknown[] }).of(...params)
				} catch {
					return VBSHelper.UNDEFINED
				}
			}
			try {
				return (o as (...a: unknown[]) => unknown).bind(parent as object)(...params)
			} catch {
				return VBSHelper.UNDEFINED
			}
		}
		for (const p of params) {
			if (o == null) return VBSHelper.UNDEFINED
			if ((o as any).__isUndefined) return VBSHelper.UNDEFINED
			try {
				o = (o as Record<string | number, unknown>)[p as string] as unknown
			} catch {
				return VBSHelper.UNDEFINED
			}
			if ((o as any)?.__isUndefined) return VBSHelper.UNDEFINED
		}
		return (o as any)?.__isUndefined ? VBSHelper.UNDEFINED : (o ?? VBSHelper.UNDEFINED)
	}

	public onErrorResumeNext(): void {
		ERR.OnErrorResumeNext()
	}
	public onErrorGoto(n: number): void {
		if (n === 0) ERR.OnErrorGoto0()
		else logger().warn('Cannot go to %s on error...', n)
	}
}
