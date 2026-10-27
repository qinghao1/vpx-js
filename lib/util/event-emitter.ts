// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

export type Listener = (...args: any[]) => void

/**
 * Zero-dependency EventEmitter subset for Node.js and browsers.
 *
 * Handlers must not throw: `emit` dispatches listeners in registration order
 * and a throwing listener aborts the dispatch — remaining listeners are
 * skipped and the error propagates to the `emit` caller (no isolation).
 */
export class EventEmitter {
	private _events: Record<string, Listener | Listener[]> = Object.create(null)

	public on(event: string, listener: Listener): this {
		const existing = this._events[event]
		if (!existing) {
			this._events[event] = listener
		} else if (typeof existing === 'function') {
			this._events[event] = [existing, listener]
		} else {
			existing.push(listener)
		}
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
		} else if (Array.isArray(list)) {
			const idx = list.findIndex(fn => fn === listener || (fn as any).listener === listener)
			if (idx !== -1) {
				list.splice(idx, 1)
				if (list.length === 1) this._events[event] = list[0]
				else if (list.length === 0) {
					// Drop emptied keys so emit() reports false instead of dispatching an empty list.
					delete this._events[event]
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
			}
		} else {
			this._events = Object.create(null)
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
		// Unwrap once() wrappers so callers see the listener they registered.
		const list = typeof handler === 'function' ? [handler] : handler.slice()
		return list.map(fn => (fn as any).listener ?? fn)
	}
}
