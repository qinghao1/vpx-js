// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { logger } from '../util/logger.js'

export interface IPoolable<T> {
	new (): T
	reset?(obj: T): void
}

/**
 * Bounded GC-reducing object pool (max 4096).
 *
 * Pooling contract (claim/release discipline):
 * - `claim()` transfers ownership to the caller; every claimed instance must be
 *   returned exactly once via `release()`.
 * - `*AndRelease` / `setAndRelease` / `dotAndRelease` consume their argument: the
 *   caller must not touch the passed instance afterwards.
 * - `clone(true)`, `crossProduct(..., true)`, `crossZ(..., true)` and
 *   `multiplyVectorT(..., true)` return pooled instances the caller owns and must
 *   release; the default `false` variants return fresh instances that need no release
 *   (releasing one is harmless).
 * - Never release the same instance twice and never use an instance after release:
 *   double-release aliases two claims to one mutable object, and use-after-release
 *   observes whatever the next claimant wrote. The pool guards against neither;
 *   violations corrupt silently.
 * - Do not store pooled instances in long-lived state unless that state's lifecycle
 *   provably brackets the claim; a stale alias observes later claims' writes.
 * - `reset` runs on release, not on claim: a claimed instance keeps whatever the
 *   previous owner left unless the `claim` wrapper re-initializes it (all
 *   `Vertex*` / `Matrix*` claim wrappers do).
 */
export class Pool<T> {
	private static readonly MAX = 4096
	private readonly items: T[] = []
	private warned = false

	constructor(private readonly ctor: IPoolable<T>) {}

	/** Claims or creates an instance. */
	get(): T {
		return this.items.pop() ?? new this.ctor()
	}

	/** Returns an instance. */
	release(obj: T): void {
		if (this.items.length >= Pool.MAX) {
			if (!this.warned) {
				logger().warn('Pool %s exhausted (%s items), excess will be GC’d.', this.ctor.name, Pool.MAX)
				this.warned = true
			}
			return
		}
		this.ctor.reset?.(obj)
		this.items.push(obj)
	}
}

/** Helper to create idiomatic pooled statics without repeating boilerplate. */
export function pooled<T>(ctor: IPoolable<T>) {
	const pool = new Pool<T>(ctor)
	return {
		pool,
		claim(): T {
			return pool.get()
		},
		release(...items: T[]): void {
			for (let i = 0; i < items.length; i++) pool.release(items[i]!)
		},
		reset(item: T): void {
			ctor.reset?.(item)
		},
	}
}
