export class EventEmitter {
	constructor() {
		this._events = Object.create(null)
		this._eventsCount = 0
		this._maxListeners = undefined
		this._e = this._events
	}
	get _e() {
		return this._events
	}
	set _e(v) {
		this._events = v
	}
	on(ev, fn) {
		const events = this._events
		if (!events[ev]) {
			events[ev] = fn
			this._eventsCount++
		} else if (typeof events[ev] === 'function') {
			events[ev] = [events[ev], fn]
		} else {
			events[ev].push(fn)
		}
		return this
	}
	addListener(ev, fn) {
		return this.on(ev, fn)
	}
	off(ev, fn) {
		const events = this._events
		const handler = events[ev]
		if (!handler) return this
		if (typeof handler === 'function') {
			if (handler === fn || handler.listener === fn) {
				delete events[ev]
				this._eventsCount--
			}
		} else {
			const idx = handler.findIndex(f => f === fn || f.listener === fn)
			if (idx !== -1) {
				handler.splice(idx, 1)
				if (handler.length === 1) events[ev] = handler[0]
				if (handler.length === 0) {
					delete events[ev]
					this._eventsCount--
				}
			}
		}
		return this
	}
	removeListener(ev, fn) {
		return this.off(ev, fn)
	}
	removeAllListeners(ev) {
		if (ev === undefined) {
			this._events = Object.create(null)
			this._eventsCount = 0
			this._e = this._events
		} else if (this._events[ev]) {
			delete this._events[ev]
			this._eventsCount = Math.max(0, this._eventsCount - 1)
		}
		return this
	}
	emit(ev, ...args) {
		const handler = this._events[ev]
		if (!handler) return false
		if (typeof handler === 'function') handler.apply(this, args)
		else handler.slice().forEach(fn => fn.apply(this, args))
		return true
	}
	once(ev, fn) {
		const wrap = (...a) => {
			this.off(ev, wrap)
			fn.apply(this, a)
		}
		wrap.listener = fn
		this.on(ev, wrap)
		return this
	}
	listeners(ev) {
		const h = this._events[ev]
		if (!h) return []
		if (typeof h === 'function') return [h.listener || h]
		return h.map(f => f.listener || f)
	}
	rawListeners(ev) {
		const h = this._events[ev]
		if (!h) return []
		if (typeof h === 'function') return [h]
		return h.slice()
	}
	eventNames() {
		return Object.keys(this._events)
	}
	listenerCount(ev) {
		const h = this._events[ev]
		if (!h) return 0
		if (typeof h === 'function') return 1
		return h.length
	}
	setMaxListeners(n) {
		this._maxListeners = n
		return this
	}
	getMaxListeners() {
		return this._maxListeners ?? 10
	}
}
export default EventEmitter
