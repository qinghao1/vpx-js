// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { VbsError } from './stdlib/err.js'
import { VbsUndefined } from './vbs-undefined.js'

/**
 * An array that always returns something.
 *
 * It's iterable and typed, and if the value at a given index doesn't exist, it
 * returns {@link VbsUndefined}, which will only throw when error handling is
 * enabled.
 */
export class VbsArray<T> implements ProxyHandler<VbsArray<T>> {
	[key: number]: T

	constructor(items?: T[]) {
		return new Proxy<VbsArray<T>>(items || ([] as any), this)
	}

	public get(target: any, key: any): T | VbsUndefined {
		return target[key] !== undefined
			? target[key]
			: new VbsUndefined(
					new VbsError(`ReferenceError: Cannot set ${String(key)} from undefined.`, 9),
					new VbsError(`ReferenceError: Cannot get ${String(key)} from undefined.`, 9),
				)
	}
}
