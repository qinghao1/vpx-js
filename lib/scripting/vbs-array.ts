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

/**
 * Integer-subscript test with the exact accept set of the former
 * `/^-?\d+$/` (optional leading minus, digits only): a hand-rolled loop,
 * since the trap runs per element access and regex setup dominates it.
 */
const branded = new WeakSet<object>()

/** Brand check: VbsArray instances proxy native arrays, so `instanceof` never fires. */
export function isVbsArray(value: unknown): value is VbsArray<unknown> {
	return typeof value === 'object' && value !== null && branded.has(value)
}

export function isIntKey(key: string): boolean {
	if (key.length === 0) return false
	let i = 0
	if (key.charCodeAt(0) === 45) {
		if (key.length === 1) return false
		i = 1
	}
	for (; i < key.length; i++) {
		const c = key.charCodeAt(i)
		if (c < 48 || c > 57) return false
	}
	return true
}

/** Rejects a Null subscript with error 94 (a string 'null' key is indistinguishable and shares it). */
function raiseNullSubscript(): void {
	ERR.Raise(new VbsError('Invalid use of Null.', 94))
}

/** VBS array — returns VbsUndefined for missing indices. */
export class VbsArray<T> implements ProxyHandler<VbsArray<T>> {
	[key: number]: T

	constructor(items?: T[]) {
		const proxy = new Proxy<VbsArray<T>>((items ?? []) as unknown as VbsArray<T>, this)
		branded.add(proxy)
		return proxy
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
		if (typeof key === 'string' && isIntKey(key)) {
			const n = Number(key)
			const t = target as unknown as Record<number, unknown>
			if (t[n] !== undefined) return t[n] as T
		}
		const t = target as Record<string | symbol, unknown>
		if (t[key] !== undefined) return t[key] as T
		// Thunks: VbsError captures a stack at construction, and most misses are never raised.
		const missed = String(key)
		return new VbsUndefined(
			() => new VbsError(`ReferenceError: Cannot set ${missed} from undefined.`, 9),
			() => new VbsError(`ReferenceError: Cannot get ${missed} from undefined.`, 9),
		)
	}

	public set(target: unknown, rawKey: string | symbol, value: unknown): boolean {
		if (rawKey === 'null') {
			raiseNullSubscript()
			return true
		}
		const key = normalizeKey(rawKey)
		if (typeof key === 'string' && isIntKey(key)) {
			const n = Number(key)
			// A negative subscript is always Subscript out of range (9).
			// Writing past the end extends the array: args pass by value, so only the caller's write can grow it.
			if (n < 0) {
				ERR.Raise(new VbsError('Subscript out of range', 9))
				return true
			}
			;(target as Record<number, unknown>)[n] = value
			return true
		}
		;(target as Record<string | symbol, unknown>)[key as string] = value
		return true
	}
}
