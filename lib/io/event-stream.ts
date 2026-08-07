/*
 * VPDB - Virtual Pinball Database
 * Copyright (C) 2019 freezy <freezy@vpdb.io>
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 */

import { createRequire } from 'node:module'
import { EventEmitter } from 'events'

const require = createRequire(import.meta.url)

export class Stream extends EventEmitter {}

const immediately: (cb: () => void) => void =
	typeof queueMicrotask !== 'undefined'
		? queueMicrotask.bind(globalThis)
		: (global as any).setImmediate
			? (global as any).setImmediate.bind(global)
			: process.nextTick.bind(process)

export function readableStream<T>(
	func: (stream: any, i: number) => Promise<T | null>,
	continueOnError: boolean = false,
) {
	const stream = new Stream()
	let i = 0
	let paused = false
	let ended = false
	let reading = false

	;(stream as any).readable = true
	;(stream as any).writable = false

	stream.on('end', () => (ended = true))

	function get(err?: Error, data: T | null = null) {
		/* istanbul ignore if */
		if (err) {
			stream.emit('error', err)
			if (!continueOnError) {
				stream.emit('end')
			}
		} else if (arguments.length > 1) {
			stream.emit('data', data)
		}

		immediately(() => {
			if (ended || paused || reading) {
				return
			}
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
				stream.emit('error', err)
				stream.emit('end')
			}
		})
	}

	;(stream as any).resume = () => {
		paused = false
		get()
	}
	if (typeof queueMicrotask !== 'undefined') {
		queueMicrotask(get as any)
	} else {
		process.nextTick(get as any)
	}
	;(stream as any).pause = () => (paused = true)
	;(stream as any).destroy = () => {
		stream.emit('end')
		stream.emit('close')
		ended = true
	}
	return stream
}
