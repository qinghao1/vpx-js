// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { describe, expect, it } from 'vitest'
import { bitmapCacheKey, exrCacheKey, idbGet, idbSet, vbsCacheKey } from './idb-cache.js'

/** Minimal in-memory indexedDB so the cache contract is exercised, not skipped. */
function installFakeIndexedDB(): void {
	const stores = new Map<string, Map<unknown, unknown>>()
	const db = {
		objectStoreNames: { contains: (name: string) => stores.has(name) },
		deleteObjectStore: (name: string) => {
			stores.delete(name)
		},
		createObjectStore: (name: string) => {
			stores.set(name, new Map())
			return {}
		},
		transaction: (_store: string, _mode: string) => {
			const tx: { objectStore: unknown; oncomplete?: () => void } = {
				objectStore: (name: string) => {
					const backing = stores.get(name)
					if (!backing) throw new Error(`missing store: ${name}`)
					return {
						get: (key: unknown) => {
							const req: { result?: unknown; onsuccess?: () => void } = {}
							queueMicrotask(() => {
								req.result = backing.get(key)
								req.onsuccess?.()
							})
							return req
						},
						put: (value: unknown, key: unknown) => {
							backing.set(key, value)
						},
					}
				},
			}
			let done: (() => void) | undefined
			Object.defineProperty(tx, 'oncomplete', {
				get: () => done,
				set: (fn: () => void) => {
					done = fn
					queueMicrotask(() => done?.())
				},
			})
			return tx
		},
	}
	const fakeIndexedDB = {
		open: (_name: string, _version: number) => {
			const req: { result?: unknown; onupgradeneeded?: () => void; onsuccess?: () => void } = {}
			queueMicrotask(() => {
				req.result = db
				req.onupgradeneeded?.()
				req.onsuccess?.()
			})
			return req
		},
	}
	;(globalThis as unknown as { indexedDB?: unknown }).indexedDB = fakeIndexedDB
}

describe('idb-cache with fake IndexedDB', () => {
	it('idbGet misses with undefined', async () => {
		installFakeIndexedDB()
		await expect(idbGet('missing-key')).resolves.toBeUndefined()
	})

	it('idbSet/idbGet round-trips a payload', async () => {
		installFakeIndexedDB()
		await idbSet('tex-key', { width: 4, height: 4 })
		await expect(idbGet('tex-key')).resolves.toEqual({ width: 4, height: 4 })
	})
})

describe('exrCacheKey', () => {
	it('distinguishes same-length textures by content', () => {
		const a = new Uint8Array([1, 2, 3, 4])
		const b = new Uint8Array([1, 2, 3, 5])
		expect(exrCacheKey('tex', b, 'exr')).not.toBe(exrCacheKey('tex', a, 'exr'))
	})

	it('is deterministic and length-sensitive', () => {
		const data = new Uint8Array([9, 8, 7])
		expect(exrCacheKey('tex', data, 'exr')).toBe(exrCacheKey('tex', data, 'exr'))
		expect(exrCacheKey('tex', data, 'exr')).not.toBe(exrCacheKey('tex', new Uint8Array([9, 8, 7, 6]), 'exr'))
	})

	it('separates name/kind/max namespaces', () => {
		const data = new Uint8Array([1])
		const base = exrCacheKey('tex', data, 'exr')
		expect(exrCacheKey('TEX', data, 'exr')).toBe(base)
		expect(exrCacheKey('other', data, 'exr')).not.toBe(base)
		expect(exrCacheKey('tex', data, 'hdr')).not.toBe(base)
		expect(exrCacheKey('tex', data, 'exr', 512)).not.toBe(base)
		expect(exrCacheKey('tex', data, 'exr', 512)).toBe(exrCacheKey('tex', data, 'exr', 512))
	})
})

describe('bitmapCacheKey', () => {
	it('distinguishes same-length payloads by content', () => {
		const a = new Uint8Array([1, 2, 3, 4])
		const b = new Uint8Array([1, 2, 3, 5])
		expect(bitmapCacheKey('tex', b, 'image/png')).not.toBe(bitmapCacheKey('tex', a, 'image/png'))
	})

	it('is deterministic and separates name/mime/max namespaces', () => {
		const data = new Uint8Array([9, 8, 7])
		const base = bitmapCacheKey('tex', data, 'image/png')
		expect(bitmapCacheKey('tex', data, 'image/png')).toBe(base)
		expect(bitmapCacheKey('TEX', data, 'image/png')).toBe(base)
		expect(bitmapCacheKey('other', data, 'image/png')).not.toBe(base)
		expect(bitmapCacheKey('tex', data, 'image/jpeg')).not.toBe(base)
		expect(bitmapCacheKey('tex', data, 'image/png', 512)).not.toBe(base)
		expect(bitmapCacheKey('tex', data, 'image/png', 512)).toBe(bitmapCacheKey('tex', data, 'image/png', 512))
	})

	it('never collides with float entries', () => {
		const data = new Uint8Array([9, 8, 7])
		expect(bitmapCacheKey('tex', data, 'image/png', 512)).not.toBe(exrCacheKey('tex', data, 'exr', 512))
	})
})

describe('vbsCacheKey', () => {
	it('is deterministic, content-sensitive, and versioned against retired prefixes', () => {
		// Stale transpiled JS running against a newer runtime produces
		// undebuggable crashes (wrong line numbers, old codegen). The prefix
		// must change whenever transpile output semantics change; retired
		// prefixes (vbs7 and older) must not be emitted anymore.
		const retired = ['vbs1:', 'vbs2:', 'vbs3:', 'vbs4:', 'vbs5:', 'vbs6:', 'vbs7:']
		const key = vbsCacheKey('Dim x')
		// Deterministic.
		expect(vbsCacheKey('Dim x')).toBe(key)
		// Content-sensitive: different scripts key differently, even at equal
		// content shape, and the length suffix separates longer scripts.
		expect(vbsCacheKey('Dim y')).not.toBe(key)
		expect(vbsCacheKey('Dim xx')).not.toBe(key)
		// Versioned: a vbs<digits>: prefix newer than every retired prefix,
		// so old cached payloads never validate against a new transpiler.
		const version = Number(/^vbs(\d+):/.exec(key)?.[1])
		expect(Number.isInteger(version)).toBe(true)
		expect(version).toBeGreaterThan(retired.length)
		for (const prefix of retired) expect(key.startsWith(prefix)).toBe(false)
	})
})
