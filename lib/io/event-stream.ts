// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EventEmitter } from 'events'

/** Minimal event stream. */
export class Stream extends EventEmitter {}

const nextTick: (cb: () => void) => void =
	typeof queueMicrotask !== 'undefined'
		? queueMicrotask.bind(globalThis)
		: (global as any).setImmediate
			? (global as any).setImmediate.bind(global)
			: process.nextTick.bind(process)

/** Lazy readable stream pulling chunks via fn. */
export function readableStream<T>(fn: (s: Stream, i: number) => Promise<T | null>, continueOnError = false) {
	const stream = new Stream() as Stream & {
		readable: boolean
		writable: boolean
		resume(): void
		pause(): void
		destroy(): void
	}
	let i = 0,
		paused = false,
		ended = false,
		reading = false

	;(stream as any).readable = true
	;(stream as any).writable = false
	stream.on('end', () => (ended = true))

	function get(err?: Error, data?: T | null) {
		if (err) {
			stream.emit('error', err)
			if (!continueOnError) stream.emit('end')
		} else if (arguments.length > 1 && data !== null && data !== undefined) stream.emit('data', data as T)
		nextTick(() => {
			if (ended || paused || reading) return
			try {
				reading = true
				fn(stream, i++)
					.then((buf) => {
						reading = false
						get(undefined, buf as T)
					})
					.catch((e) => {
						stream.emit('error', e)
						stream.emit('end')
					})
			} catch (e) {
				get(e as Error)
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
