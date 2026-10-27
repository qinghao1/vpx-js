// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from './event-emitter.js'

describe('EventEmitter', () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('emits to listeners and reports whether anyone listened', () => {
		const emitter = new EventEmitter()
		expect(emitter.emit('data')).toBe(false)
		const seen: unknown[][] = []
		emitter.on('data', (...args: unknown[]) => seen.push(args))
		expect(emitter.emit('data', 1, 'two')).toBe(true)
		expect(seen).toEqual([[1, 'two']])
	})

	it('removes one listener while keeping the rest', () => {
		const emitter = new EventEmitter()
		const calls: string[] = []
		const a = () => calls.push('a')
		const b = () => calls.push('b')
		emitter.on('ev', a).on('ev', b)
		emitter.off('ev', a)
		emitter.emit('ev')
		expect(calls).toEqual(['b'])
		expect(emitter.listenerCount('ev')).toBe(1)
	})

	it('cleans up the event key when the last array listener is removed', () => {
		const emitter = new EventEmitter()
		const a = () => {}
		const b = () => {}
		emitter.on('ev', a).on('ev', b)
		emitter.off('ev', a)
		emitter.off('ev', b)
		expect(emitter.listenerCount('ev')).toBe(0)
		expect(emitter.listeners('ev')).toEqual([])
		// An emptied key must not dispatch (or report true) anymore.
		expect(emitter.emit('ev')).toBe(false)
	})

	it('cleans up the event key when a single listener is removed', () => {
		const emitter = new EventEmitter()
		const a = () => {}
		emitter.on('ev', a)
		emitter.off('ev', a)
		expect(emitter.emit('ev')).toBe(false)
		expect(emitter.listenerCount('ev')).toBe(0)
	})

	it('ignores off() for unknown events or listeners', () => {
		const emitter = new EventEmitter()
		expect(() => emitter.off('missing', () => {})).not.toThrow()
		const a = () => {}
		emitter.on('ev', a)
		emitter.off('ev', () => {})
		expect(emitter.listenerCount('ev')).toBe(1)
	})

	it('fires once() listeners exactly once', () => {
		const emitter = new EventEmitter()
		let calls = 0
		emitter.once('ev', () => calls++)
		emitter.emit('ev')
		emitter.emit('ev')
		expect(calls).toBe(1)
		expect(emitter.emit('ev')).toBe(false)
	})

	it('removes one event or all events', () => {
		const emitter = new EventEmitter()
		emitter.on('a', () => {}).on('b', () => {})
		emitter.removeAllListeners('a')
		expect(emitter.emit('a')).toBe(false)
		expect(emitter.emit('b')).toBe(true)
		emitter.removeAllListeners()
		expect(emitter.emit('b')).toBe(false)
	})

	it('returns a copy from listeners()', () => {
		const emitter = new EventEmitter()
		const a = () => {}
		emitter.on('ev', a)
		const copy = emitter.listeners('ev')
		expect(copy).toEqual([a])
		copy.push(() => {})
		expect(emitter.listenerCount('ev')).toBe(1)
	})

	it('aliases addListener/removeListener to on/off', () => {
		const emitter = new EventEmitter()
		const a = () => {}
		emitter.addListener('ev', a)
		expect(emitter.listenerCount('ev')).toBe(1)
		emitter.removeListener('ev', a)
		expect(emitter.emit('ev')).toBe(false)
	})

	it('defaults the max to 10 and round-trips set/get', () => {
		const emitter = new EventEmitter()
		expect(emitter.getMaxListeners()).toBe(10)
		emitter.setMaxListeners(3)
		expect(emitter.getMaxListeners()).toBe(3)
	})

	it('rejects negative max listeners', () => {
		expect(() => new EventEmitter().setMaxListeners(-1)).toThrow(RangeError)
	})

	it('warns once when listeners exceed the max', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
		const emitter = new EventEmitter().setMaxListeners(2)
		emitter.on('ev', () => {}).on('ev', () => {})
		expect(warn).not.toHaveBeenCalled()
		emitter.on('ev', () => {})
		expect(warn).toHaveBeenCalledTimes(1)
		expect(warn.mock.calls[0]?.[0]).toContain('MaxListenersExceededWarning')
		emitter.on('ev', () => {})
		expect(warn).toHaveBeenCalledTimes(1)
	})

	it('warns again after the event is emptied and re-exceeded', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
		const emitter = new EventEmitter().setMaxListeners(1)
		const a = () => {}
		const b = () => {}
		emitter.on('ev', a).on('ev', b)
		expect(warn).toHaveBeenCalledTimes(1)
		emitter.off('ev', a).off('ev', b)
		emitter.on('ev', a).on('ev', b)
		expect(warn).toHaveBeenCalledTimes(2)
	})

	it('treats 0 as unlimited', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
		const emitter = new EventEmitter().setMaxListeners(0)
		for (let i = 0; i < 12; i++) emitter.on('ev', () => {})
		expect(emitter.listenerCount('ev')).toBe(12)
		expect(warn).not.toHaveBeenCalled()
	})
})
