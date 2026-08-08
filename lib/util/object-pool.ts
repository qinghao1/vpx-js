// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { logger } from './logger.js'

export interface IPoolable<T> {
	new (): T
	reset?(obj: T): void
}

/** Tiny GC-reducing pool. */
export class Pool<T> {
	private static readonly MAX = 512
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
