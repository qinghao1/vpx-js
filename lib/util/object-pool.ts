// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { logger } from './logger.js'

/** Poolable constructor with optional reset hook. */
export interface IPoolable<T> {
	new (): T
	reset?(obj: T): void
}

/** Simple object pool to reduce GC pressure in hot paths. */
export class Pool<T> {
	private static readonly MAX_SIZE = 100

	private readonly ctor: IPoolable<T>
	private readonly items: T[] = []
	private warned = false

	constructor(ctor: IPoolable<T>) {
		this.ctor = ctor
	}

	/** Claims an instance from the pool or creates a new one. */
	get(): T {
		const obj = this.items.pop() ?? new this.ctor()
		;(obj as Record<string, unknown>).__pool = true
		return obj
	}

	/** Returns an instance to the pool. */
	release(obj: T): void {
		const o = obj as Record<string, unknown>
		if (!o.__pool) {
			logger().warn('Trying to recycle non-pooled %s, aborting.', this.ctor.name)
			return
		}
		if (this.items.length >= Pool.MAX_SIZE) {
			if (!this.warned) {
				logger().warn('Pool %s exhausted (%s items), excess will be GC’d.', this.ctor.name, Pool.MAX_SIZE)
				this.warned = true
			}
			return
		}
		this.ctor.reset?.(obj)
		this.items.push(obj)
	}
}
