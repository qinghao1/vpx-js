// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { afterEach, describe, expect, it, vi } from 'vitest'
import { poolSize } from './image-worker-pool.js'

describe('poolSize', () => {
	it('clamps finite core counts to [1, cap]', () => {
		expect(poolSize(8, 4)).toBe(4)
		expect(poolSize(2, 4)).toBe(2)
		expect(poolSize(1, 2)).toBe(1)
		expect(poolSize(0, 4)).toBe(1)
		expect(poolSize(-3, 4)).toBe(1)
	})

	it('floors fractional core counts', () => {
		expect(poolSize(2.7, 4)).toBe(2)
	})

	it('falls back to the cap default on missing/NaN/Infinity', () => {
		expect(poolSize(NaN, 4)).toBe(4)
		expect(poolSize(NaN, 2)).toBe(2)
		expect(poolSize(undefined, 4)).toBe(4)
		expect(poolSize('4', 4)).toBe(4)
		expect(poolSize(Infinity, 4)).toBe(4)
		expect(poolSize(-Infinity, 2)).toBe(2)
	})
})

describe('image worker pool sizing', () => {
	const G = globalThis as any
	const savedWorker = G.Worker
	const savedNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')

	afterEach(() => {
		G.Worker = savedWorker
		if (savedNavigator) Object.defineProperty(globalThis, 'navigator', savedNavigator)
		vi.resetModules()
	})

	it('spawns a full pool when hardwareConcurrency is NaN instead of main-threading everything', async () => {
		// Node exposes navigator as a getter-only global: redefine instead of assigning.
		Object.defineProperty(globalThis, 'navigator', {
			value: { hardwareConcurrency: NaN },
			configurable: true,
			writable: true,
		})
		const workers: any[] = []
		G.Worker = class FakeWorker {
			public onmessage: ((e: any) => void) | null = null
			public onerror: ((e: any) => void) | null = null
			public constructor(_url: URL) {
				workers.push(this)
			}
			public postMessage(msg: any) {
				queueMicrotask(() =>
					this.onmessage?.({ data: { id: msg.id, ok: true, bitmap: { width: 8, height: 8, close() {} } } }),
				)
			}
		}
		vi.resetModules()
		const { decodeInWorker } = await import('./image-worker-pool.js')
		const bitmap = (await decodeInWorker(new Uint8Array(16), 'image/png', 4096, 'some_wall')) as any
		// NaN used to size the pool to zero (Math.min(NaN, 4) is NaN, so the
		// spawn loop never ran) and every decode fell back to the main thread.
		expect(workers).toHaveLength(4)
		expect(bitmap.width).toBe(8)
	})
})
