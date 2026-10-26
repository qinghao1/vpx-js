// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { ERR, VbsError } from './stdlib/err.js'
import { UNDEF, VbsUndefined } from './vbs-undefined.js'

function normalizeKey(key: string | symbol): string | symbol {
	if (typeof key === 'symbol') return key
	// VBS: an Empty subscript reads index 0. A Null subscript is error 94 and
	// never reaches here (both traps reject the 'null' key first).
	if (key === 'undefined') return '0'
	return key
}

/** Rejects a Null subscript with error 94 (a string 'null' key is indistinguishable and shares it). */
function raiseNullSubscript(): void {
	ERR.Raise(new VbsError('Invalid use of Null.', 94))
}

/** VBS array — returns VbsUndefined for missing indices. */
export class VbsArray<T> implements ProxyHandler<VbsArray<T>> {
	[key: number]: T

	constructor(items?: T[]) {
		return new Proxy<VbsArray<T>>((items ?? []) as unknown as VbsArray<T>, this)
	}

	public get(target: unknown, rawKey: string | symbol): T | VbsUndefined {
		if (rawKey === UNDEF || typeof rawKey === 'symbol') {
			return (target as Record<string | symbol, unknown>)[rawKey] as T
		}
		if (rawKey === 'null') {
			raiseNullSubscript()
			return new VbsUndefined()
		}
		const key = normalizeKey(rawKey)
		if (typeof key === 'string' && /^-?\d+$/.test(key)) {
			const n = Number(key)
			const t = target as unknown as Record<number, unknown>
			if (t[n] !== undefined) return t[n] as T
		}
		const t = target as Record<string | symbol, unknown>
		return t[key] !== undefined
			? (t[key] as T)
			: new VbsUndefined(
					new VbsError(`ReferenceError: Cannot set ${String(key)} from undefined.`, 9),
					new VbsError(`ReferenceError: Cannot get ${String(key)} from undefined.`, 9),
				)
	}

	public set(target: unknown, rawKey: string | symbol, value: unknown): boolean {
		if (rawKey === 'null') {
			raiseNullSubscript()
			return true
		}
		const key = normalizeKey(rawKey)
		if (typeof key === 'string' && /^-?\d+$/.test(key)) {
			const n = Number(key)
			;(target as Record<number, unknown>)[n] = value
			return true
		}
		;(target as Record<string | symbol, unknown>)[key as string] = value
		return true
	}
}
