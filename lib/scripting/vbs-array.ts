// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { VbsError } from './stdlib/err.js'
import { UNDEF, VbsUndefined } from './vbs-undefined.js'

/** VBS array — returns VbsUndefined for missing indices. */
export class VbsArray<T> implements ProxyHandler<VbsArray<T>> {
	[key: number]: T

	// biome-ignore lint/correctness/noConstructorReturn: Proxy trap - constructor returns Proxy for VBS array semantics
	constructor(items?: T[]) {
		return new Proxy<VbsArray<T>>((items ?? []) as unknown as VbsArray<T>, this)
	}

	public get(target: unknown, key: string | symbol): T | VbsUndefined {
		if (key === UNDEF || typeof key === 'symbol') {
			return (target as Record<string | symbol, unknown>)[key] as T
		}
		const t = target as Record<string | symbol, unknown>
		return t[key] !== undefined
			? (t[key] as T)
			: new VbsUndefined(
					new VbsError(`ReferenceError: Cannot set ${String(key)} from undefined.`, 9),
					new VbsError(`ReferenceError: Cannot get ${String(key)} from undefined.`, 9),
				)
	}
}
