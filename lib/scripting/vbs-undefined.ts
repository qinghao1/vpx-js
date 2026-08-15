// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { ERR, VbsError } from './stdlib/err.js'

export const UNDEF = Symbol.for('vbs.undefined')

/** VBS undefined sentinel. */
export class VbsUndefined implements ProxyHandler<any> {
	private readonly __errSet?: VbsError
	private readonly __errGet?: VbsError

	constructor(errSet?: VbsError, errGet?: VbsError) {
		this.__errSet = errSet
		this.__errGet = errGet
		return new Proxy(this, this)
	}

	public get(target: any, p: string | number | symbol, _receiver: any): any {
		if (p === UNDEF) {
			return true
		}
		if (p === Symbol.iterator) {
			return () => [][Symbol.iterator]()
		}
		if (p === 'toString') {
			return () => 'undefined'
		}
		if (p === 'valueOf') {
			return () => 0
		}
		if (p === 'constructor' || p === 'prototype' || p === '__proto__') {
			return undefined
		}
		if (typeof p === 'symbol' || ['inspect', '__errGet', '__errSet'].includes(p as string)) {
			return Reflect.get(target, p)
		}
		ERR.Raise(
			this.__errGet ||
				new VbsError(`ReferenceError: Cannot get property "${String(p)}" of undefined array element.`, 9),
		)
		return this
	}

	public set(_target: any, p: string | number | symbol, _value: any, _receiver: any): boolean {
		ERR.Raise(
			this.__errSet ||
				new VbsError(`ReferenceError: Cannot set property "${String(p)}" of undefined array element.`, 9),
		)
		return true
	}

	public has(_target: any, p: string | number | symbol): boolean {
		if (p === Symbol.iterator || p === UNDEF) return true
		return false
	}
}
