// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EventEmitter } from 'events'

export class Stream extends EventEmitter {}

const nextTick: (cb: () => void) => void =
	typeof queueMicrotask !== 'undefined'
		? queueMicrotask.bind(globalThis)
		: (global as any).setImmediate
			? (global as any).setImmediate.bind(global)
			: process.nextTick.bind(process)

/**
 * Creates a lazy readable stream that pulls chunks via `func`.
 * @param func provider returning next chunk or null for EOM
 * @param continueOnError if true, don't emit 'end' on error
 */
export function readableStream<T>(func: (stream: Stream, i: number) => Promise<T | null>, continueOnError = false) {
	const stream = new Stream()
	let i = 0
	let paused = false
	let ended = false
	let reading = false

	;(stream as any).readable = true
	;(stream as any).writable = false
	stream.on('end', () => (ended = true))

	function get(err?: Error, data: T | null = null): void {
		if (err) {
			stream.emit('error', err)
			if (!continueOnError) stream.emit('end')
		} else if (arguments.length > 1) {
			stream.emit('data', data)
		}
		nextTick(() => {
			if (ended || paused || reading) return
			try {
				reading = true
				func(stream, i++)
					.then((buffer) => {
						reading = false
						get(undefined, buffer)
					})
					.catch((e) => {
						stream.emit('error', e)
						stream.emit('end')
					})
			} catch (err) {
				stream.emit('error', err as Error)
				stream.emit('end')
			}
		})
	}

	;(stream as any).resume = () => {
		paused = false
		get()
	}
	nextTick(get as any)
	;(stream as any).pause = () => (paused = true)
	;(stream as any).destroy = () => {
		stream.emit('end')
		stream.emit('close')
		ended = true
	}
	return stream as Stream & { readable: boolean; writable: boolean; resume(): void; pause(): void; destroy(): void }
}
