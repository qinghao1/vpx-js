// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { ERR, VbsError } from './stdlib/err.js'

export class VbsUndefined implements ProxyHandler<any> {
	// tslint:disable-next-line:variable-name
	private readonly __errSet?: VbsError
	// tslint:disable-next-line:variable-name
	private readonly __errGet?: VbsError

	constructor(errSet?: VbsError, errGet?: VbsError) {
		this.__errSet = errSet
		this.__errGet = errGet
		return new Proxy(this, this)
	}

	public get(target: any, p: string | number | symbol, receiver: any): any {
		if (p === 'toString') {
			return () => undefined
		}
		if (typeof p === 'symbol' || ['valueOf', 'toString', 'inspect', '__errGet', '__errSet'].includes(p as string)) {
			return Reflect.get(target, p)
		}
		if (p === '__isUndefined') {
			return true
		}
		ERR.Raise(
			this.__errGet ||
				new VbsError(`ReferenceError: Cannot get property "${String(p)}" of undefined array element.`, 9),
		)
		return this
	}

	public set(target: any, p: string | number | symbol, value: any, receiver: any): boolean {
		ERR.Raise(
			this.__errSet ||
				new VbsError(`ReferenceError: Cannot set property "${String(p)}" of undefined array element.`, 9),
		)
		return true
	}
}
