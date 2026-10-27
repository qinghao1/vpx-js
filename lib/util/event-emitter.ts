// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

export type Listener = (...args: any[]) => void

/** Isomorphic zero-dependency EventEmitter for Node.js and Browser. */
export class EventEmitter {
	private _events: Record<string, Listener | Listener[]> = Object.create(null)
	private _eventsCount = 0
	private _maxListeners?: number
	private _maxWarned = new Set<string>()

	public on(event: string, listener: Listener): this {
		const existing = this._events[event]
		if (!existing) {
			this._events[event] = listener
			this._eventsCount++
		} else if (typeof existing === 'function') {
			this._events[event] = [existing, listener]
		} else {
			existing.push(listener)
		}
		this._checkMaxListeners(event)
		return this
	}

	public addListener(event: string, listener: Listener): this {
		return this.on(event, listener)
	}

	public once(event: string, listener: Listener): this {
		const wrapper = (...args: any[]) => {
			this.off(event, wrapper)
			listener.apply(this, args)
		}
		;(wrapper as any).listener = listener
		return this.on(event, wrapper)
	}

	public off(event: string, listener: Listener): this {
		const list = this._events[event]
		if (!list) return this
		if (list === listener || (list as any).listener === listener) {
			delete this._events[event]
			this._eventsCount--
			this._maxWarned.delete(event)
		} else if (Array.isArray(list)) {
			const idx = list.findIndex(fn => fn === listener || (fn as any).listener === listener)
			if (idx !== -1) {
				list.splice(idx, 1)
				if (list.length === 1) this._events[event] = list[0]
				else if (list.length === 0) {
					// Last listener removed through the array path: drop the
					// key entirely so emit() reports false instead of
					// dispatching to (and returning true for) an empty list.
					delete this._events[event]
					this._eventsCount--
					this._maxWarned.delete(event)
				}
			}
		}
		return this
	}

	public removeListener(event: string, listener: Listener): this {
		return this.off(event, listener)
	}

	public removeAllListeners(event?: string): this {
		if (event) {
			if (this._events[event]) {
				delete this._events[event]
				this._eventsCount--
				this._maxWarned.delete(event)
			}
		} else {
			this._events = Object.create(null)
			this._eventsCount = 0
			this._maxWarned.clear()
		}
		return this
	}

	public emit(event: string, ...args: any[]): boolean {
		const handler = this._events[event]
		if (!handler) return false
		if (typeof handler === 'function') {
			handler.apply(this, args)
		} else {
			const copy = handler.slice()
			for (const fn of copy) fn.apply(this, args)
		}
		return true
	}

	public listenerCount(event: string): number {
		const handler = this._events[event]
		if (!handler) return 0
		return typeof handler === 'function' ? 1 : handler.length
	}

	public listeners(event: string): Listener[] {
		const handler = this._events[event]
		if (!handler) return []
		return typeof handler === 'function' ? [handler] : handler.slice()
	}

	public setMaxListeners(n: number): this {
		if (typeof n !== 'number' || Number.isNaN(n) || n < 0) {
			throw new RangeError(`setMaxListeners requires a non-negative number, got ${n}`)
		}
		this._maxListeners = n
		return this
	}

	public getMaxListeners(): number {
		return this._maxListeners ?? 10
	}

	/**
	 * Warns once per event when listeners exceed the max (Node parity: 0 or
	 * Infinity means unlimited). Previously the limit was stored but never
	 * enforced, so leaks grew silently.
	 */
	private _checkMaxListeners(event: string): void {
		const max = this.getMaxListeners()
		if (!(max > 0) || max === Infinity) return
		if (this.listenerCount(event) > max && !this._maxWarned.has(event)) {
			this._maxWarned.add(event)
			console.warn(
				`MaxListenersExceededWarning: Possible EventEmitter memory leak detected. ` +
					`${this.listenerCount(event)} "${event}" listeners added (max is ${max}). ` +
					`Use emitter.setMaxListeners() to increase the limit.`,
			)
		}
	}
}
