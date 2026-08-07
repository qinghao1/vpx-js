// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { logger } from './logger.js'

/** Simple object pool to reduce GC in hot paths. */
export class Pool<T> {
	private static DEBUG = 0
	private static TRACE = false
	private static MAX_POOL_SIZE = 100

	private readonly pool: T[] = []
	private readonly poolable: IPoolable<T>
	private warned = false

	private debugging?: ReturnType<typeof setInterval>
	private recycled = 0
	private created = 0
	private released = 0
	private skipped = 0
	private claimed: Record<string, number> = {}
	private unclaimed: Record<string, number> = {}

	constructor(poolable: IPoolable<T>) {
		this.poolable = poolable
		/* istanbul ignore next */
		if (Pool.DEBUG > 0) this.setupDebug(Pool.DEBUG)
	}

	/** Gets an instance from the pool or creates a new one. */
	get(): T {
		let caller = ''
		/* istanbul ignore next */
		if (this.debugging && Pool.TRACE) {
			caller = new Error().stack!.split('\n')[3].trim()
			this.claimed[caller] = (this.claimed[caller] ?? 0) + 1
		}

		let obj: T
		if (this.pool.length) {
			this.recycled++
			obj = this.pool.shift()!
		} else {
			if (this.pool.length < Pool.MAX_POOL_SIZE) this.warned = false
			this.created++
			obj = new this.poolable()
		}

		if (caller) (obj as Record<string, unknown>).__caller = caller
		else delete (obj as Record<string, unknown>)._caller
		;(obj as Record<string, unknown>).__pool = true
		return obj
	}

	/** Returns an object to the pool. */
	release(o: T): void {
		const obj = o as any
		/* istanbul ignore next */
		if ((obj as Record<string, unknown>).__caller) {
			const caller = (obj as Record<string, unknown>).__caller as string
			delete (obj as Record<string, unknown>).__caller
			if (!this.claimed[caller]) this.unclaimed[caller] = (this.unclaimed[caller] ?? 0) + 1
			else {
				this.claimed[caller]--
				if (this.claimed[caller] === 0) delete this.claimed[caller]
			}
		}
		if (!(obj as Record<string, unknown>).__pool) {
			this.skipped++
			logger().warn('Trying to recycle non-claimed %s, aborting.', this.poolable.name)
			return
		}
		/* istanbul ignore next */
		if (this.pool.length >= Pool.MAX_POOL_SIZE) {
			if (!this.warned) {
				logger().warn(
					'Pool size %s of %s is exhausted, future objects will be garbage-collected.',
					Pool.MAX_POOL_SIZE,
					this.poolable.name,
				)
				this.warned = true
			}
			this.skipped++
			return
		}
		this.poolable.reset?.(o)
		this.released++
		this.pool.push(o)
	}

	/* istanbul ignore next */
	enableDebug(interval = 10_000): this {
		if (Pool.DEBUG <= 0 && interval > 0 && !this.debugging) {
			logger().debug('[Pool] %s: Debug enabled.', this.poolable.name)
			this.setupDebug(interval)
		}
		return this
	}

	/* istanbul ignore next */
	private setupDebug(interval: number): void {
		this.debugging = setInterval(() => {
			logger().debug(
				'[Pool] %s: %s recycled, %s created, %s released, %s skipped (%s%)',
				this.poolable.name,
				this.recycled,
				this.created,
				this.released,
				this.skipped,
				Math.floor((this.recycled / (this.recycled + this.created)) * 100000) / 1000,
			)
			if (Pool.TRACE) {
				for (const [caller, count] of Object.entries(this.claimed))
					logger().debug('[Pool] %s: Unreleased: %d %s', this.poolable.name, count, caller)
				for (const [caller, count] of Object.entries(this.unclaimed))
					logger().debug('[Pool] %s: Released without claimed: %d %s', this.poolable.name, count, caller)
			}
			this.recycled = this.created = this.released = this.skipped = 0
			this.claimed = {}
			this.unclaimed = {}
		}, interval)
	}
}

/** Poolable constructor with optional reset hook. */
export interface IPoolable<T> {
	new (): T
	reset?(obj: T): void
}
