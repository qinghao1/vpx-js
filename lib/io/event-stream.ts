// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EventEmitter } from 'events'

/** Minimal event stream. */
export class Stream extends EventEmitter {}

const nextTick: (cb: () => void) => void =
	typeof queueMicrotask !== 'undefined'
		? queueMicrotask.bind(globalThis)
		: (globalThis as unknown as { setImmediate?: (cb: () => void) => void }).setImmediate
			? (globalThis as unknown as { setImmediate: (cb: () => void) => void }).setImmediate.bind(globalThis)
			: process.nextTick.bind(process)

/** Lazy readable streaming `fn` until it returns null. */
export function readableStream<T>(fn: (s: Stream, i: number) => Promise<T | null>, continueOnError = false) {
	const stream = new Stream() as Stream & {
		readable: boolean
		writable: boolean
		resume(): void
		pause(): void
		destroy(): void
	}
	let i = 0
	let paused = false
	let ended = false
	let reading = false

	;(stream as unknown as { readable: boolean }).readable = true
	;(stream as unknown as { writable: boolean }).writable = false
	stream.on('end', () => (ended = true))

	function get(data?: T | null, err?: Error): void {
		if (err) {
			stream.emit('error', err)
			if (!continueOnError) stream.emit('end')
		} else if (data !== null && data !== undefined) stream.emit('data', data)
		nextTick(() => {
			if (ended || paused || reading) return
			try {
				reading = true
				fn(stream, i++)
					.then((buf) => {
						reading = false
						get(buf as T)
					})
					.catch((e) => {
						stream.emit('error', e)
						stream.emit('end')
					})
			} catch (e) {
				get(undefined, e as Error)
			}
		})
	}

	nextTick(() => get())
	stream.resume = () => {
		if (paused) {
			paused = false
			get()
		}
	}
	stream.pause = () => {
		paused = true
	}
	stream.destroy = () => {
		ended = true
		stream.emit('close')
	}

	return stream
}
