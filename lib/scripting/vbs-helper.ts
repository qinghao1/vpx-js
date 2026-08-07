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

	constructor(transpiler: Transpiler) {
		this.transpiler = transpiler
	}

	public dim(dimensions: number[], pos = 0): any[] {
		const n = dimensions?.length ? dimensions[pos] + 1 : 0
		const arr = new VbsArray(new Array(n).fill(VBSHelper.UNDEFINED))
		if (++pos < dimensions.length)
			for (let i = 0; i < n; i++) (arr as unknown as unknown[])[i] = this.dim(dimensions, pos)
		return arr as unknown as any[]
	}

	public redim(array: any[], dimensions: number[], preserve = false): any[] {
		let tmp: any = array
		for (let i = 0; i < dimensions.length - 1; i++) {
			if (tmp.length !== dimensions[i] + 1) throw new Error('Only last dimension can be changed')
			tmp = tmp[0]
		}
		return preserve ? this.redimResize(array as any, dimensions) : (this.dim(dimensions) as any)
	}

	public transpileInline(vbs: string, filename?: string): string {
		let prefix = ''
		if (filename) prefix = `//@ sourceURL=game:///${filename}.js\n`
		else if (vbs.length > 150) prefix = `//@ sourceURL=game:///inline${this.transpileCount++}.js\n`
		return prefix + this.transpiler.transpile(vbs)
	}

	private redimResize(array: any[], dimensions: number[], pos = 0): any[] {
		const n = dimensions[pos] + 1
		if (pos === dimensions.length - 1) (array as unknown[]).length = n
		if (++pos < dimensions.length)
			for (let i = 0; i < n; i++) (array as any)[i] = this.redimResize((array as any)[i], dimensions, pos)
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

	public intDiv(a: number, b: number): number {
		return Math.floor(Math.floor(a) / Math.floor(b))
	}
	public exponent(b: number, e: number): number {
		return b ** e
	}

	public equals(a: unknown, b: unknown): boolean {
		if (a == b) return true
		const u1 = typeof a === 'object' && (a as any).__isUndefined,
			u2 = typeof b === 'object' && (b as any).__isUndefined
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

	public getOrCall(obj: any, ...params: number[]) {
		if (typeof obj === 'function') return obj.bind(obj)(...params)
		for (const p of params) obj = obj[p]
		return obj
	}

	public getOrCallBound(parent: any, prop: string, ...params: number[]) {
		let o: any = parent[prop]
		if (typeof o === 'function') return o.bind(parent)(...params)
		for (const p of params) o = o[p]
		return o
	}

	public onErrorResumeNext(): void {
		ERR.OnErrorResumeNext()
	}
	public onErrorGoto(n: number): void {
		if (n === 0) ERR.OnErrorGoto0()
		else logger().warn('Cannot go to %s on error...', n)
	}
}
