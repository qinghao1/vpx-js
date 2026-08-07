// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { logger } from './logger.js'

export interface IPoolable<T> {
	new (): T
	reset?(obj: T): void
}

/** Tiny GC-reducing pool. */
export class Pool<T> {
	private static readonly MAX = 100
	private readonly ctor: IPoolable<T>
	private readonly items: T[] = []
	private readonly pooled = new WeakSet<object>()
	private warned = false

	constructor(ctor: IPoolable<T>) {
		this.ctor = ctor
	}

	/** Claims or creates an instance. */
	get(): T {
		const obj = this.items.pop() ?? new this.ctor()
		this.pooled.add(obj as object)
		return obj
	}

	/** Returns an instance. */
	release(obj: T): void {
		if (!this.pooled.has(obj as object)) {
			logger().warn('Trying to recycle non-pooled %s, aborting.', this.ctor.name)
			return
		}
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
