// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { HalfFloatType, LinearFilter, LinearMipmapLinearFilter, RGBAFormat } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_FLOAT_TEXTURE_BYTES } from '../../util/quality.js'
import { cappedDecodeTarget, cappedTarget, probeEncodedSize } from './encoded-size-probe.js'
import { decodeInWorker, hasImageWorker } from './image-worker-pool.js'
import { ThreeTextureLoaderBrowser } from './three-texture-loader-browser.js'

vi.mock('../../util/idb-cache.js', async importOriginal => {
	const mod = await importOriginal<typeof import('../../util/idb-cache.js')>()
	return { ...mod, idbGet: vi.fn(async () => undefined), idbSet: vi.fn(async () => {}) }
})

vi.mock('./image-worker-pool.js', async importOriginal => {
	const mod = await importOriginal<typeof import('./image-worker-pool.js')>()
	return {
		...mod,
		hasImageWorker: vi.fn(() => false),
		decodeInWorker: vi.fn(async () => {
			throw new Error('no image worker')
		}),
	}
})

describe('ThreeTextureLoaderBrowser float size bound', () => {
	it('rejects oversized non-playfield EXR/HDR payloads before worker decode', async () => {
		const loader = new ThreeTextureLoaderBrowser()
		const huge = new Uint8Array(MAX_FLOAT_TEXTURE_BYTES + 1)
		// Fail fast with 'too large' so the map generator skips on its debug path.
		await expect(loader.loadTexture('cabinet_env', '.exr', huge)).rejects.toThrow(/too large/)
		await expect(loader.loadTexture('cabinet_env', '.hdr', huge)).rejects.toThrow(/too large/)
	})
	it('throws for oversized playfield/nestmap floats without a worker pool instead of slow-parsing', async () => {
		const loader = new ThreeTextureLoaderBrowser()
		const huge = new Uint8Array(MAX_FLOAT_TEXTURE_BYTES + 1)
		// No Worker in node: the pool outage surfaces as infra so the map
		// generator skips — the slow main-thread parse would expand the 512MB
		// frame the cap prevents. Over-cap playfields reach the pool (not the
		// fail-fast guard) but must never fall back to the main thread.
		await expect(loader.loadTexture('vlm.nestmap1', '.exr', huge)).rejects.toMatchObject({
			code: 'float-no-worker',
		})
		await expect(loader.loadTexture('vlm.nestmap1', '.hdr', huge)).rejects.toMatchObject({
			code: 'float-no-worker',
		})
		// Small non-playfield payloads still reach the worker path (node has none), proving no over-blocking.
		await expect(loader.loadTexture('cabinet_env', '.exr', new Uint8Array(1024))).rejects.toThrow(/no worker/)
	})
})

describe('ThreeTextureLoaderBrowser tuning', () => {
	const loader = new ThreeTextureLoaderBrowser()
	const raw = (name: string, w: number, h: number) =>
		loader.loadRawTexture(name, new Uint8Array(w * h * 4), w, h) as Promise<any>

	it('caps anisotropy at 8 (high tier requests 16)', async () => {
		const tex = await raw('some_wall', 512, 512)
		expect(tex.anisotropy).toBe(8)
	})

	it('keeps mipmaps on ordinary textures', async () => {
		const tex = await raw('some_wall', 512, 512)
		expect(tex.generateMipmaps).toBe(true)
		expect(tex.minFilter).toBe(LinearMipmapLinearFilter)
	})

	it('disables mipmaps for DMD maps (always magnified, never minified)', async () => {
		const tex = await raw('DMD_panel', 128, 32)
		expect(tex.generateMipmaps).toBe(false)
		expect(tex.minFilter).toBe(LinearFilter)
	})

	it('disables mipmaps for icon-class textures (longest edge <= 64)', async () => {
		const tex = await raw('screw', 32, 32)
		expect(tex.generateMipmaps).toBe(false)
		expect(tex.minFilter).toBe(LinearFilter)
	})

	it('keeps RGBAFormat for fully-opaque raw bitmaps (WebGPU has no RGB8)', async () => {
		const w = 16
		const h = 16
		const data = new Uint8Array(w * h * 4)
		for (let i = 0; i < data.length; i += 4) {
			data[i] = i & 0xff
			data[i + 1] = (i >> 2) & 0xff
			data[i + 2] = (i >> 4) & 0xff
			data[i + 3] = 0xff
		}
		const tex = (await loader.loadRawTexture('playfield_opaque', data, w, h)) as any
		expect(tex.format).toBe(RGBAFormat)
		expect(tex.image.data).toBe(data)
		expect([data[0], data[1], data[2], data[3]]).toEqual([0, 0, 0, 0xff])
	})
})

describe('EXR worker pool', () => {
	type PostedMsg = { id: number; buffer: ArrayBuffer; worker: any }
	const savedGlobals: Record<string, unknown> = {}
	let savedNavigator: PropertyDescriptor | undefined

	afterEach(() => {
		vi.useRealTimers()
		const G = globalThis as any
		for (const k of ['Worker', 'window', 'document', 'createImageBitmap']) G[k] = savedGlobals[k]
		if (savedNavigator) Object.defineProperty(globalThis, 'navigator', savedNavigator)
	})

	/** Fresh loader with a fake Worker + DOM-ish globals, so routing is observable without a browser. */
	function installFakes(
		handlers: { float?: (msg: any, worker: any) => void; post?: (msg: any, worker: any) => void },
		cores = 2,
	) {
		const G = globalThis as any
		for (const k of ['Worker', 'window', 'document', 'createImageBitmap']) savedGlobals[k] = G[k]
		savedNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
		const posted: PostedMsg[] = []
		const workers: any[] = []
		// Node exposes navigator as a getter-only global: redefine instead of assigning.
		Object.defineProperty(globalThis, 'navigator', {
			value: { hardwareConcurrency: cores },
			configurable: true,
			writable: true,
		})
		G.window = {}
		G.document = {}
		G.Worker = class FakeWorker {
			public onmessage: ((e: any) => void) | null = null
			public onerror: ((e: any) => void) | null = null
			public terminate = vi.fn()
			public url: URL
			public constructor(url: URL) {
				this.url = url
				workers.push(this)
			}
			public postMessage(msg: any) {
				// A throwing post hook simulates postMessage clone failures:
				// the post never records and no reply is ever queued.
				handlers.post?.(msg, this)
				posted.push({ id: msg.id, buffer: msg.buffer, worker: this })
				queueMicrotask(() => handlers.float?.(msg, this))
			}
		}
		return { posted, workers }
	}

	async function freshLoader() {
		vi.resetModules()
		return (await import('./three-texture-loader-browser.js'))
			.ThreeTextureLoaderBrowser as typeof ThreeTextureLoaderBrowser
	}

	function floatFrame(id: number, w = 64, h = 32) {
		return {
			id,
			ok: true,
			width: w,
			height: h,
			data: new Uint16Array(w * h * 4),
			type: HalfFloatType,
			format: RGBAFormat,
			colorSpace: 'srgb',
		}
	}

	it('decodes float textures in the EXR worker pool, not via main-thread parse', async () => {
		const { EXRLoader } = await import('three/examples/jsm/loaders/EXRLoader.js')
		const parseSpy = vi.spyOn(EXRLoader.prototype as any, 'parse')
		const createSpy = vi.spyOn(EXRLoader.prototype as any, 'createDataTexture')
		try {
			const fakes = installFakes({
				float: (msg, worker) => worker.onmessage?.({ data: floatFrame(msg.id) }),
			})
			const Loader = await freshLoader()
			const idb = await import('../../util/idb-cache.js')
			vi.mocked(idb.idbGet).mockClear()
			vi.mocked(idb.idbSet).mockClear()
			const tex = (await new Loader().loadTexture('cabinet_env', '.exr', new Uint8Array(1024))) as any
			expect(fakes.posted).toHaveLength(1)
			expect(parseSpy).not.toHaveBeenCalled()
			expect(createSpy).not.toHaveBeenCalled()
			expect(vi.mocked(idb.idbGet)).toHaveBeenCalledTimes(1)
			expect(vi.mocked(idb.idbSet)).toHaveBeenCalledTimes(1)
			expect(tex.image.width).toBe(64)
			expect(tex.name).toBe('texture:cabinet_env')
		} finally {
			parseSpy.mockRestore()
			createSpy.mockRestore()
		}
	})

	it('decodes concurrent float textures on parallel EXR workers', async () => {
		const responders: Array<() => void> = []
		const fakes = installFakes({
			float: (msg, worker) => {
				responders.push(() => worker.onmessage?.({ data: floatFrame(msg.id) }))
			},
		})
		const Loader = await freshLoader()
		const loader = new Loader()
		const first = loader.loadTexture('env_a', '.exr', new Uint8Array(1024))
		const second = loader.loadTexture('env_b', '.exr', new Uint8Array(1024))
		await new Promise(r => setTimeout(r, 10))
		// Two workers (hardwareConcurrency 2): one decode each, never serialized on one.
		expect(fakes.workers).toHaveLength(2)
		expect(fakes.posted.filter(p => p.worker === fakes.workers[0])).toHaveLength(1)
		expect(fakes.posted.filter(p => p.worker === fakes.workers[1])).toHaveLength(1)
		for (const respond of responders) respond()
		const [t1, t2] = (await Promise.all([first, second])) as any[]
		expect(t1.image.width).toBe(64)
		expect(t2.image.width).toBe(64)
	})

	it('routes over-cap playfield floats to the worker pool instead of the slow main-thread parse', async () => {
		const { EXRLoader } = await import('three/examples/jsm/loaders/EXRLoader.js')
		const parseSpy = vi.spyOn(EXRLoader.prototype as any, 'parse')
		try {
			const fakes = installFakes({
				float: (msg, worker) => worker.onmessage?.({ data: floatFrame(msg.id, 512, 256) }),
			})
			const Loader = await freshLoader()
			const huge = new Uint8Array(MAX_FLOAT_TEXTURE_BYTES + 1)
			const tex = (await new Loader().loadTexture('vlm.nestmap1', '.exr', huge)) as any
			expect(fakes.posted).toHaveLength(1)
			expect(fakes.posted[0].buffer.byteLength).toBe(huge.byteLength)
			expect(parseSpy).not.toHaveBeenCalled()
			expect(tex.image.width).toBe(512)
		} finally {
			parseSpy.mockRestore()
		}
	})

	it('still fails fast for over-cap non-playfield floats without touching a worker', async () => {
		const fakes = installFakes({
			float: () => expect.unreachable('over-cap non-playfield must not reach a worker'),
		})
		const Loader = await freshLoader()
		await expect(new Loader().loadTexture('cabinet_env', '.exr', new Uint8Array(17 * 1024 * 1024))).rejects.toThrow(
			/too large/,
		)
		expect(fakes.posted).toHaveLength(0)
	})

	it('caches the IDB round-trip for over-cap playfield floats', async () => {
		const fakes = installFakes({
			float: (msg, worker) => worker.onmessage?.({ data: floatFrame(msg.id, 512, 256) }),
		})
		const Loader = await freshLoader()
		const idb = await import('../../util/idb-cache.js')
		vi.mocked(idb.idbGet).mockClear()
		vi.mocked(idb.idbSet).mockClear()
		const huge = new Uint8Array(MAX_FLOAT_TEXTURE_BYTES + 1)
		const tex = (await new Loader().loadTexture('vlm.nestmap1', '.exr', huge)) as any
		expect(fakes.posted).toHaveLength(1)
		expect(tex.image.width).toBe(512)
		// Over-cap playfield bakes (~9s DWAA re-parse, measured) are IDB-cached:
		// revival is ~69ms read + ~176ms clone (measured) and writes are fire-and-forget.
		expect(vi.mocked(idb.idbGet)).toHaveBeenCalledTimes(1)
		expect(vi.mocked(idb.idbSet)).toHaveBeenCalledTimes(1)
	})

	it("retries the crashed worker's decode on its replacement, leaving the survivor alone", async () => {
		let posts = 0
		const fakes = installFakes({
			float: (msg, worker) => {
				// Crash only the first decode; the retry and the survivor answer.
				if (++posts === 1) {
					worker.onerror?.({ message: 'boom', error: new Error('boom') })
					return
				}
				worker.onmessage?.({ data: floatFrame(msg.id) })
			},
		})
		const Loader = await freshLoader()
		const loader = new Loader()
		const first = loader.loadTexture('env_a', '.exr', new Uint8Array(1024))
		const second = loader.loadTexture('env_b', '.exr', new Uint8Array(1024))
		const settledFirst = first.then(
			v => ({ ok: v }),
			e => ({ err: e }),
		)
		const settledSecond = second.then(
			v => ({ ok: v }),
			e => ({ err: e }),
		)
		await new Promise(r => setTimeout(r, 10))
		expect(fakes.posted).toHaveLength(3)
		const [dead, survivor] = fakes.workers
		expect(fakes.posted[0].worker).toBe(dead)
		expect(fakes.posted[1].worker).toBe(survivor)
		// The crashed decode was retried and resolves; the survivor was never disturbed.
		expect(((await settledFirst) as any).ok.image.width).toBe(64)
		expect(((await settledSecond) as any).ok.image.width).toBe(64)
		// The dead worker was terminated and replaced: the pool keeps serving.
		expect(dead.terminate).toHaveBeenCalled()
		expect(fakes.workers).toHaveLength(3)
		const third = loader.loadTexture('env_c', '.exr', new Uint8Array(1024))
		const settledThird = third.then(
			v => ({ ok: v }),
			e => ({ err: e }),
		)
		await new Promise(r => setTimeout(r, 10))
		const lastPost = fakes.posted[fakes.posted.length - 1]
		lastPost.worker.onmessage?.({ data: floatFrame(lastPost.id) })
		expect(((await settledThird) as any).ok.image.width).toBe(64)
	})

	it('times out a hung worker: fails every affine entry and replaces it', async () => {
		vi.useFakeTimers()
		try {
			const fakes = installFakes({ float: () => {} })
			const Loader = await freshLoader()
			const loader = new Loader()
			const p1 = loader.loadTexture('env_a', '.exr', new Uint8Array(1024))
			const p2 = loader.loadTexture('env_b', '.exr', new Uint8Array(1024))
			const p3 = loader.loadTexture('env_c', '.exr', new Uint8Array(1024))
			const s1 = p1.then(
				v => ({ ok: v }),
				e => ({ err: e }),
			)
			const s2 = p2.then(
				v => ({ ok: v }),
				e => ({ err: e }),
			)
			const s3 = p3.then(
				v => ({ ok: v }),
				e => ({ err: e }),
			)
			await vi.advanceTimersByTimeAsync(0)
			expect(fakes.posted).toHaveLength(3)
			// env_b landed on the second worker: answer it, hang the first worker's two.
			const survivorPost = fakes.posted.find(p => p.worker === fakes.workers[1])
			expect(survivorPost).toBeDefined()
			if (survivorPost) survivorPost.worker.onmessage?.({ data: floatFrame(survivorPost.id) })
			await vi.advanceTimersByTimeAsync(0)
			await vi.advanceTimersByTimeAsync(120000)
			expect(((await s1) as any).err).toMatchObject({ code: 'float-worker-timeout' })
			expect(((await s2) as any).ok.image.width).toBe(64)
			expect(((await s3) as any).err).toMatchObject({ code: 'float-worker-timeout' })
			expect(fakes.workers[0].terminate).toHaveBeenCalled()
			expect(fakes.workers).toHaveLength(3)
		} finally {
			vi.useRealTimers()
		}
	})

	it('throws instead of slow-parsing when a hung worker strands an over-cap playfield bake', async () => {
		vi.useFakeTimers()
		try {
			installFakes({ float: () => {} })
			const Loader = await freshLoader()
			const settled = new Loader()
				.loadTexture('vlm.nestmap1', '.exr', new Uint8Array(MAX_FLOAT_TEXTURE_BYTES + 1))
				.then(
					v => ({ ok: v }),
					e => ({ err: e }),
				)
			await vi.advanceTimersByTimeAsync(0)
			await vi.advanceTimersByTimeAsync(120000)
			// Over-cap: the infra error surfaces so the map generator skips —
			// the slow main-thread parse would expand the 512MB frame the cap
			// prevents. (Under-cap playfields still fall back; see below.)
			expect(((await settled) as any).err).toMatchObject({ code: 'float-worker-timeout' })
		} finally {
			vi.useRealTimers()
		}
	})

	it('throws instead of slow-parsing when an over-cap playfield bake OOMs its worker', async () => {
		installFakes({
			float: (_msg, worker) => worker.onerror?.({ message: 'oom', error: new Error('oom') }),
		})
		const Loader = await freshLoader()
		// Crash plus failed retry surfaces infra; over-cap must not fall
		// through to the slow main-thread parse (the 512MB expansion the cap
		// prevents) — the map generator skips on this throw instead.
		await expect(
			new Loader().loadTexture('vlm.nestmap1', '.exr', new Uint8Array(MAX_FLOAT_TEXTURE_BYTES + 1)),
		).rejects.toMatchObject({ code: 'float-worker-crash' })
	})

	it('holds concurrent decodes to a single worker on 1-core machines', async () => {
		const responders: Array<() => void> = []
		const fakes = installFakes(
			{
				float: (msg, worker) => {
					responders.push(() => worker.onmessage?.({ data: floatFrame(msg.id) }))
				},
			},
			1,
		)
		const Loader = await freshLoader()
		const loader = new Loader()
		const first = loader.loadTexture('env_a', '.exr', new Uint8Array(1024))
		const second = loader.loadTexture('env_b', '.exr', new Uint8Array(1024))
		await new Promise(r => setTimeout(r, 10))
		expect(fakes.workers).toHaveLength(1)
		expect(fakes.posted).toHaveLength(2)
		for (const respond of responders) respond()
		const [t1, t2] = (await Promise.all([first, second])) as any[]
		expect(t1.image.width).toBe(64)
		expect(t2.image.width).toBe(64)
	})

	it('defaults to two workers when hardwareConcurrency is NaN', async () => {
		const responders: Array<() => void> = []
		const fakes = installFakes(
			{
				float: (msg, worker) => {
					responders.push(() => worker.onmessage?.({ data: floatFrame(msg.id) }))
				},
			},
			NaN,
		)
		const Loader = await freshLoader()
		const loader = new Loader()
		const first = loader.loadTexture('env_a', '.exr', new Uint8Array(1024))
		const second = loader.loadTexture('env_b', '.exr', new Uint8Array(1024))
		await new Promise(r => setTimeout(r, 10))
		expect(fakes.workers).toHaveLength(2)
		expect(fakes.posted.filter(p => p.worker === fakes.workers[0])).toHaveLength(1)
		expect(fakes.posted.filter(p => p.worker === fakes.workers[1])).toHaveLength(1)
		for (const respond of responders) respond()
		const [t1, t2] = (await Promise.all([first, second])) as any[]
		expect(t1.image.width).toBe(64)
		expect(t2.image.width).toBe(64)
	})

	it('rejects float decodes with a typed error once the pending queue is full', async () => {
		// Workers never answer: every submission stays pending.
		const fakes = installFakes({ float: () => {} })
		const Loader = await freshLoader()
		const loader = new Loader()
		// Cap is 2x pool size: 2 workers here, so 4 submissions queue.
		const queued = []
		for (let i = 0; i < 4; i++)
			queued.push(
				loader.loadTexture(`env_${i}`, '.exr', new Uint8Array(1024)).then(
					v => ({ ok: v }),
					e => ({ err: e }),
				),
			)
		await new Promise(r => setTimeout(r, 10))
		expect(fakes.posted).toHaveLength(4)
		await expect(loader.loadTexture('env_over', '.exr', new Uint8Array(1024))).rejects.toMatchObject({
			code: 'float-queue-full',
		})
		// Rejected before touching a worker: no fifth post.
		expect(fakes.posted).toHaveLength(4)
		// Drain the queue so no 120s watchdog timers leak past the test.
		for (const p of fakes.posted) p.worker.onmessage?.({ data: floatFrame(p.id) })
		expect((await Promise.all(queued)).every(r => (r as any).ok)).toBe(true)
	})

	it('queues over-cap playfield bakes past a full pending queue instead of failing fast', async () => {
		// Workers never answer: every submission stays pending.
		const fakes = installFakes({ float: () => {} })
		const Loader = await freshLoader()
		const loader = new Loader()
		const queued = []
		for (let i = 0; i < 4; i++)
			queued.push(
				loader.loadTexture(`env_${i}`, '.exr', new Uint8Array(1024)).then(
					v => ({ ok: v }),
					e => ({ err: e }),
				),
			)
		await new Promise(r => setTimeout(r, 10))
		expect(fakes.posted).toHaveLength(4)
		// The bake must queue, not reject: rejection costs a 30s failure-cooldown retry.
		const bake = loader.loadTexture('vlm.nestmap1', '.exr', new Uint8Array(MAX_FLOAT_TEXTURE_BYTES + 1)).then(
			v => ({ ok: v }),
			e => ({ err: e }),
		)
		await new Promise(r => setTimeout(r, 10))
		expect(fakes.posted).toHaveLength(5)
		for (const p of fakes.posted) p.worker.onmessage?.({ data: floatFrame(p.id, 512, 256) })
		const results = await Promise.all([...queued, bake])
		expect(results.every(r => (r as any).ok)).toBe(true)
	})

	it('warms the float pool without waiting for the first decode', async () => {
		const fakes = installFakes({
			float: (msg, worker) => worker.onmessage?.({ data: floatFrame(msg.id) }),
		})
		const Loader = await freshLoader()
		const loader = new Loader()
		loader.warmup()
		// Workers spawned + one tiny warmup decode each, before any loadTexture.
		expect(fakes.workers).toHaveLength(2)
		expect(fakes.posted).toHaveLength(2)
		expect(fakes.posted[0].buffer.byteLength).toBeLessThan(256)
		// Second kick is a no-op: no more spawns, no more decodes.
		loader.warmup()
		expect(fakes.workers).toHaveLength(2)
		expect(fakes.posted).toHaveLength(2)
		await new Promise(r => setTimeout(r, 10))
		const tex = (await loader.loadTexture('env_a', '.exr', new Uint8Array(1024))) as any
		expect(fakes.workers).toHaveLength(2)
		expect(tex.image.width).toBe(64)
	})

	it("retries the messageerror worker's decode on its replacement, leaving the survivor alone", async () => {
		let posts = 0
		const fakes = installFakes({
			float: (msg, worker) => {
				// Fail only the first decode's clone; the retry and the survivor answer.
				if (++posts === 1) {
					worker.onmessageerror?.({ data: 'clone failed' })
					return
				}
				worker.onmessage?.({ data: floatFrame(msg.id) })
			},
		})
		const Loader = await freshLoader()
		const loader = new Loader()
		const first = loader.loadTexture('env_a', '.exr', new Uint8Array(1024))
		const second = loader.loadTexture('env_b', '.exr', new Uint8Array(1024))
		const settledFirst = first.then(
			v => ({ ok: v }),
			e => ({ err: e }),
		)
		const settledSecond = second.then(
			v => ({ ok: v }),
			e => ({ err: e }),
		)
		await new Promise(r => setTimeout(r, 10))
		expect(fakes.posted).toHaveLength(3)
		const [dead, survivor] = fakes.workers
		expect(fakes.posted[0].worker).toBe(dead)
		expect(fakes.posted[1].worker).toBe(survivor)
		// The failed decode was retried and resolves; the survivor was never disturbed.
		expect(((await settledFirst) as any).ok.image.width).toBe(64)
		expect(((await settledSecond) as any).ok.image.width).toBe(64)
		// The dead worker was terminated and replaced: the pool keeps serving.
		expect(dead.terminate).toHaveBeenCalled()
		expect(fakes.workers).toHaveLength(3)
	})

	it('retries a crashed decode once on the fresh worker', async () => {
		let posts = 0
		const fakes = installFakes({
			float: (msg, worker) => {
				posts++
				if (posts === 1) {
					worker.onerror?.({ message: 'boom', error: new Error('boom') })
					return
				}
				worker.onmessage?.({ data: floatFrame(msg.id) })
			},
		})
		const Loader = await freshLoader()
		const tex = (await new Loader().loadTexture('env_a', '.exr', new Uint8Array(1024))) as any
		expect(tex.image.width).toBe(64)
		expect(fakes.posted).toHaveLength(2)
	})

	it('retries a crashed decode only once', async () => {
		const fakes = installFakes({
			float: (_msg, worker) => worker.onerror?.({ message: 'boom', error: new Error('boom') }),
		})
		const Loader = await freshLoader()
		await expect(new Loader().loadTexture('env_a', '.exr', new Uint8Array(1024))).rejects.toMatchObject({
			code: 'float-worker-crash',
		})
		expect(fakes.posted).toHaveLength(2)
	})

	it('replaces the worker when postMessage throws so the retry lands off the dead worker', async () => {
		let posts = 0
		const fakes = installFakes({
			float: (msg, worker) => worker.onmessage?.({ data: floatFrame(msg.id) }),
			post: () => {
				if (++posts === 1) throw new Error('post boom')
			},
		})
		const Loader = await freshLoader()
		const tex = (await new Loader().loadTexture('env_a', '.exr', new Uint8Array(1024))) as any
		expect(tex.image.width).toBe(64)
		const [dead] = fakes.workers
		// The failed post terminated and respawned its worker; the thrown
		// post never recorded, and the retry resolved off a live worker.
		expect(dead.terminate).toHaveBeenCalled()
		expect(fakes.workers).toHaveLength(3)
		expect(fakes.posted).toHaveLength(1)
		expect(fakes.posted[0].worker).not.toBe(dead)
		expect(fakes.workers).toContain(fakes.posted[0].worker)
	})

	it('regrows to target size on the next ensure after a once-failing Worker constructor', async () => {
		const fakes = installFakes(
			{
				float: (msg, worker) => worker.onmessage?.({ data: floatFrame(msg.id) }),
			},
			2,
		)
		const G = globalThis as any
		const RealWorker = G.Worker
		let calls = 0
		G.Worker = class extends RealWorker {
			public constructor(url: URL) {
				if (calls++ === 0) throw new Error('spawn boom')
				super(url)
			}
		}
		const Loader = await freshLoader()
		const loader = new Loader()
		// The first spawn fails, so the pool stays empty and the decode surfaces infra.
		await expect(loader.loadTexture('env_a', '.exr', new Uint8Array(1024))).rejects.toMatchObject({
			code: 'float-no-worker',
		})
		expect(fakes.workers).toHaveLength(0)
		// The next ensure rebuilds the pool whole: target size, serving decodes.
		const tex = (await loader.loadTexture('env_b', '.exr', new Uint8Array(1024))) as any
		expect(fakes.workers).toHaveLength(2)
		expect(fakes.posted).toHaveLength(1)
		expect(tex.image.width).toBe(64)
	})

	it('falls back to the slow parse for under-cap playfield textures on pool outage', async () => {
		installFakes({
			float: (_msg, worker) => worker.onerror?.({ message: 'boom', error: new Error('boom') }),
		})
		const Loader = await freshLoader()
		// Crash plus failed retry surfaces infra, then the playfield fallback
		// runs the slow parse — which fails on zero bytes, proving it ran.
		await expect(new Loader().loadTexture('playfield', '.exr', new Uint8Array(1024))).rejects.toThrow(
			/HDR\/EXR parse failed/,
		)
		// Non-playfield has no fallback: the infra error surfaces.
		await expect(new Loader().loadTexture('env_a', '.exr', new Uint8Array(1024))).rejects.toMatchObject({
			code: 'float-worker-crash',
		})
	})

	it('exempts warmup decodes from the queue cap', async () => {
		const fakes = installFakes({ float: () => {} })
		const Loader = await freshLoader()
		const loader = new Loader()
		loader.warmup()
		await new Promise(r => setTimeout(r, 10))
		expect(fakes.posted).toHaveLength(2)
		const queued = []
		for (let i = 0; i < 4; i++)
			queued.push(
				loader.loadTexture(`env_${i}`, '.exr', new Uint8Array(1024)).then(
					v => ({ ok: v }),
					e => ({ err: e }),
				),
			)
		await new Promise(r => setTimeout(r, 10))
		// Warmup's two pending decodes must not consume burst capacity.
		expect(fakes.posted).toHaveLength(6)
		await expect(loader.loadTexture('env_over', '.exr', new Uint8Array(1024))).rejects.toMatchObject({
			code: 'float-queue-full',
		})
		expect(fakes.posted).toHaveLength(6)
		for (const p of fakes.posted) p.worker.onmessage?.({ data: floatFrame(p.id) })
		expect((await Promise.all(queued)).every(r => (r as any).ok)).toBe(true)
	})
})

describe('ThreeTextureLoaderBrowser LDR decode-at-size', () => {
	const loader = new ThreeTextureLoaderBrowser()

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	function pngBytes(width: number, height: number): Uint8Array {
		const data = new Uint8Array(32)
		data.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
		data[16] = (width >>> 24) & 0xff
		data[17] = (width >>> 16) & 0xff
		data[18] = (width >>> 8) & 0xff
		data[19] = width & 0xff
		data[20] = (height >>> 24) & 0xff
		data[21] = (height >>> 16) & 0xff
		data[22] = (height >>> 8) & 0xff
		data[23] = height & 0xff
		return data
	}

	function jpegBytes(width: number, height: number): Uint8Array {
		const data = new Uint8Array(32)
		data.set([
			0xff,
			0xd8,
			0xff,
			0xc0,
			0x00,
			0x0b,
			0x08,
			(height >>> 8) & 0xff,
			height & 0xff,
			(width >>> 8) & 0xff,
			width & 0xff,
			0x01,
			0x01,
			0x11,
			0x00,
		])
		return data
	}

	function gifBytes(width: number, height: number): Uint8Array {
		const data = new Uint8Array(16)
		data.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
		data[6] = width & 0xff
		data[7] = (width >>> 8) & 0xff
		data[8] = height & 0xff
		data[9] = (height >>> 8) & 0xff
		return data
	}

	function bmpBytes(width: number, height: number): Uint8Array {
		const data = new Uint8Array(32)
		data.set([0x42, 0x4d])
		data[14] = 40
		data[18] = width & 0xff
		data[19] = (width >>> 8) & 0xff
		data[20] = (width >>> 16) & 0xff
		data[21] = (width >>> 24) & 0xff
		data[22] = height & 0xff
		data[23] = (height >>> 8) & 0xff
		data[24] = (height >>> 16) & 0xff
		data[25] = (height >>> 24) & 0xff
		return data
	}

	function webpBytes(fourcc: string, dims: (d: Uint8Array) => void): Uint8Array {
		const data = new Uint8Array(32)
		data.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
		data.set(
			[...fourcc].map(c => c.charCodeAt(0)),
			12,
		)
		dims(data)
		return data
	}

	it('routes oversized (>16MB) images through the worker with zero main-thread decode', async () => {
		const large = new Uint8Array(16 * 1024 * 1024 + 1)
		vi.mocked(hasImageWorker).mockReturnValue(true)
		vi.mocked(decodeInWorker).mockClear()
		vi.mocked(decodeInWorker).mockResolvedValue({ width: 3040, height: 4096, close() {} } as any)
		const mainDecode = vi.fn(async () => {
			throw new Error('must not decode on the main thread')
		})
		vi.stubGlobal('createImageBitmap', mainDecode)
		const tex = (await loader.loadTexture('playfield_image', '.webp', large)) as any
		// Same bytes reach the pool (it slices + transfers a copy); the capped
		// size rides along so the worker decodes at size, not full-res.
		// NOTE: assert identity/scalars separately — toHaveBeenCalledWith on a
		// 16MB TypedArray makes vitest deep-compare (key enumeration) and OOMs.
		expect(decodeInWorker).toHaveBeenCalledTimes(1)
		const [bytes, mime, max, name] = vi.mocked(decodeInWorker).mock.calls[0]
		expect(bytes).toBe(large)
		expect(mime).toBe('image/webp')
		expect(max).toBe(4096)
		expect(name).toBe('playfield_image')
		expect(mainDecode).not.toHaveBeenCalled()
		expect(tex.image.width).toBe(3040)
		expect(tex.image.height).toBe(4096)
	})

	it('requests the capped size up front on the main-thread fallback', async () => {
		vi.mocked(hasImageWorker).mockReturnValue(false)
		vi.mocked(decodeInWorker).mockClear()
		const seen: any[] = []
		vi.stubGlobal(
			'createImageBitmap',
			vi.fn(async (_blob: any, opts: any) => {
				seen.push(opts)
				return { width: opts?.resizeWidth ?? 100, height: opts?.resizeHeight ?? 100, close() {} }
			}),
		)
		const tex = (await loader.loadTexture('playfield_image', '.png', pngBytes(6080, 8192))) as any
		expect(decodeInWorker).not.toHaveBeenCalled()
		expect(seen[0]).toMatchObject({
			resizeWidth: 3040,
			resizeHeight: 4096,
			resizeQuality: 'high',
			premultiplyAlpha: 'none',
			colorSpaceConversion: 'none',
		})
		expect(tex.image.width).toBe(3040)
		expect(tex.image.height).toBe(4096)
	})

	it('runs the two-step resize when the codec ignores single-step resize options', async () => {
		vi.mocked(hasImageWorker).mockReturnValue(false)
		vi.mocked(decodeInWorker).mockClear()
		const seen: any[] = []
		vi.stubGlobal(
			'createImageBitmap',
			vi.fn(async (src: any, opts: any) => {
				seen.push(opts)
				// The codec ignores resize options on blob decode: full-res back.
				if (typeof Blob !== 'undefined' && src instanceof Blob) return { width: 6080, height: 8192, close() {} }
				return { width: opts?.resizeWidth ?? 0, height: opts?.resizeHeight ?? 0, close() {} }
			}),
		)
		const tex = (await loader.loadTexture('playfield_image', '.png', pngBytes(6080, 8192))) as any
		expect(decodeInWorker).not.toHaveBeenCalled()
		// Sized decode, then the two-step resize of the over-cap bitmap (no second full decode).
		expect(seen).toHaveLength(2)
		expect(seen[0]).toMatchObject({ resizeWidth: 3040, resizeHeight: 4096 })
		expect(seen[1]).toMatchObject({ resizeWidth: 3040, resizeHeight: 4096 })
		expect(tex.image.width).toBe(3040)
		expect(tex.image.height).toBe(4096)
	})

	it('shares probe vectors between the loader and the worker paths', () => {
		const vectors = [
			pngBytes(6080, 8192),
			jpegBytes(6080, 8192),
			gifBytes(6080, 8192),
			bmpBytes(6080, 8192),
			webpBytes('VP8 ', d => {
				d[23] = 0x9d
				d[24] = 0x01
				d[25] = 0x2a
				d[26] = 0xc0
				d[27] = 0x17
				d[28] = 0x00
				d[29] = 0x20
			}),
			webpBytes('VP8L', d => {
				d[20] = 0x2f
				d[21] = 0xbf
				d[22] = 0xd7
				d[23] = 0xff
				d[24] = 0x07
			}),
			webpBytes('VP8X', d => {
				d[24] = 0xbf
				d[25] = 0x17
				d[26] = 0x00
				d[27] = 0xff
				d[28] = 0x1f
				d[29] = 0x00
			}),
		]
		expect(probeEncodedSize(pngBytes(6080, 8192))).toEqual({ width: 6080, height: 8192 })
		for (const bytes of vectors) {
			const capped = { width: 3040, height: 4096 }
			expect(cappedTarget(probeEncodedSize(bytes), 4096)).toEqual(capped)
			expect(cappedDecodeTarget(bytes, 4096)).toEqual(capped)
		}
	})

	it('probes a 10-byte GIF at the floor', () => {
		// GIF dims live at bytes 6-9: a 10-byte header is the smallest probed input.
		const floor = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x10, 0x00, 0x10, 0x00])
		expect(probeEncodedSize(floor)).toEqual({ width: 16, height: 16 })
		expect(probeEncodedSize(floor.slice(0, 9))).toBeNull()
	})

	it('resolves a JPEG SOF ending at the exact tail', () => {
		// SOI + APP0 + SOF0(64x32) ending at the last byte: the scan bound is
		// inclusive of the tail (the SOF needs bytes i..i+8 with i+9 == end).
		const data = new Uint8Array([
			0xff, 0xd8, 0xff, 0xe0, 0x00, 0x05, 0x01, 0x02, 0x03, 0xff, 0xc0, 0x00, 0x07, 0x08, 0x00, 0x20, 0x00, 0x40,
		])
		expect(probeEncodedSize(data)).toEqual({ width: 64, height: 32 })
		expect(cappedDecodeTarget(data, 4096)).toBeNull()
	})

	it('falls through when bitmap-source resize returns an over-cap frame', async () => {
		vi.mocked(hasImageWorker).mockReturnValue(false)
		vi.mocked(decodeInWorker).mockClear()
		// The engine ignores resize at both tiers: blob and bitmap sources come back full-res.
		const cib = vi.fn(async () => ({ width: 6080, height: 8192, close() {} }))
		vi.stubGlobal('createImageBitmap', cib)
		// No ImageDecoder stub: decodeMainAtSize throws and the oversize bitmap falls through.
		const { Loader } = await import('three')
		const loadSpy = vi
			.spyOn(Loader.prototype as any, 'loadAsync')
			.mockResolvedValue({ image: { width: 3040, height: 4096 } } as any)
		try {
			const tex = (await loader.loadTexture('playfield_image', '.png', pngBytes(6080, 8192))) as any
			expect(decodeInWorker).not.toHaveBeenCalled()
			// Sized blob decode + bitmap-source resize attempt, both ignored.
			expect(cib).toHaveBeenCalledTimes(2)
			// The TextureLoader fallthrough keeps the output bounded.
			expect(tex.image.width).toBe(3040)
			expect(tex.image.height).toBe(4096)
		} finally {
			loadSpy.mockRestore()
			vi.unstubAllGlobals()
		}
	})

	it('rejects PNG headers without the IHDR chunk tag', () => {
		const bad = pngBytes(6080, 8192)
		bad.set([0x49, 0x44, 0x41, 0x54], 12)
		expect(probeEncodedSize(bad)).toBeNull()
		expect(cappedDecodeTarget(bad, 4096)).toBeNull()
	})

	it('stops the JPEG scan at SOS instead of walking entropy data', () => {
		// SOI + SOS with no SOF before it: dims live before SOS, so stop.
		const sos = new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x08, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
		expect(probeEncodedSize(sos)).toBeNull()
		expect(cappedDecodeTarget(sos, 4096)).toBeNull()
	})

	it('skips non-marker bytes in the JPEG scan instead of returning a guess', () => {
		const fill = new Uint8Array([0xff, 0xd8, 0x00, 0x10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
		expect(probeEncodedSize(fill)).toBeNull()
		expect(cappedDecodeTarget(fill, 4096)).toBeNull()
	})

	it('skips FF fill bytes before the JPEG SOF', () => {
		// SOI + two fill bytes + SOF0(6080x8192): padding 0xFFs carry no dims.
		const data = new Uint8Array([
			0xff, 0xd8, 0xff, 0xff, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x20, 0x00, 0x17, 0xc0, 0x01, 0x01, 0x11, 0x00,
		])
		expect(probeEncodedSize(data)).toEqual({ width: 6080, height: 8192 })
	})

	it('skips short (len<2) JPEG segments and only bounds-checks SOF dims', () => {
		// SOI + bogus len-0 APP-ish segment + SOF0(6080x8192): the short
		// segment steps over, the SOF still resolves.
		const data = new Uint8Array([
			0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x20, 0x00, 0x17, 0xc0, 0x01, 0x01, 0x11,
			0x00,
		])
		expect(probeEncodedSize(data)).toEqual({ width: 6080, height: 8192 })
		// A short SOF is corrupt, not skippable: safe-direction null.
		const shortSof = new Uint8Array([
			0xff, 0xd8, 0xff, 0xc0, 0x00, 0x05, 0x08, 0x20, 0x00, 0x17, 0xc0, 0, 0, 0, 0, 0,
		])
		expect(probeEncodedSize(shortSof)).toBeNull()
	})

	it('requires the full 8-byte PNG signature', () => {
		const bad = pngBytes(6080, 8192)
		bad.set([0x00, 0x00, 0x00, 0x00], 4)
		expect(probeEncodedSize(bad)).toBeNull()
		expect(cappedDecodeTarget(bad, 4096)).toBeNull()
	})

	it('stops the JPEG scan past ~64KB (safe-direction null)', () => {
		// SOI + a max-length APP segment pushing SOF past the scan cap:
		// headers that large never carry early SOF dims, so fall back to
		// full decode instead of walking the whole file.
		const data = new Uint8Array(66 * 1024)
		data[0] = 0xff
		data[1] = 0xd8
		data[2] = 0xff
		data[3] = 0xe0
		data[4] = 0xff
		data[5] = 0xff
		const o = 66 * 1024 - 16
		data.set([0xff, 0xc0, 0x00, 0x0b, 0x08, 0x20, 0x00, 0x17, 0xc0, 0x01, 0x01, 0x11, 0x00], o)
		expect(o).toBeGreaterThan(64 * 1024)
		expect(probeEncodedSize(data)).toBeNull()
		expect(cappedDecodeTarget(data, 4096)).toBeNull()
	})

	it('tries ImageDecoder at size when the codec ignores single-step resize', async () => {
		vi.mocked(hasImageWorker).mockReturnValue(false)
		vi.mocked(decodeInWorker).mockClear()
		const seen: any[] = []
		const inits: any[] = []
		vi.stubGlobal(
			'createImageBitmap',
			vi.fn(async (src: any, opts: any) => {
				seen.push(opts)
				// The codec ignores resize options on blob decode: full-res back.
				if (typeof Blob !== 'undefined' && src instanceof Blob) return { width: 6080, height: 8192, close() {} }
				// The decoder did the scaling: the VideoFrame comes back capped.
				return { width: 3040, height: 4096, close() {} }
			}),
		)
		vi.stubGlobal(
			'ImageDecoder',
			class {
				public static async isTypeSupported() {
					return true
				}
				public constructor(init: any) {
					inits.push(init)
				}
				public async decode() {
					return { image: { close() {} } }
				}
				public close() {}
			},
		)
		const tex = (await loader.loadTexture('playfield_image', '.png', pngBytes(6080, 8192))) as any
		expect(decodeInWorker).not.toHaveBeenCalled()
		// Sized decode, then the decoder at size (no second full CIB decode,
		// no bitmap-to-bitmap resize of the over-cap bitmap).
		expect(inits).toHaveLength(1)
		expect(inits[0]).toMatchObject({ desiredWidth: 3040, desiredHeight: 4096, type: 'image/png' })
		expect(seen).toHaveLength(2)
		expect(seen[0]).toMatchObject({ resizeWidth: 3040, resizeHeight: 4096 })
		expect(seen[1]).not.toMatchObject({ resizeWidth: 3040 })
		expect(tex.image.width).toBe(3040)
		expect(tex.image.height).toBe(4096)
	})

	it('falls back to main-thread decode when the worker rejects', async () => {
		vi.mocked(hasImageWorker).mockReturnValue(true)
		vi.mocked(decodeInWorker).mockClear()
		vi.mocked(decodeInWorker).mockRejectedValue(new Error('image worker timeout'))
		vi.stubGlobal(
			'createImageBitmap',
			vi.fn(async () => ({ width: 100, height: 100, close() {} })),
		)
		const tex = (await loader.loadTexture('some_wall', '.png', pngBytes(100, 100))) as any
		expect(decodeInWorker).toHaveBeenCalledTimes(1)
		expect(tex.image.width).toBe(100)
	})

	it('fits every regular container to the cap from headers alone', () => {
		const playfield = { width: 3040, height: 4096 }
		expect(cappedDecodeTarget(pngBytes(6080, 8192), 4096)).toEqual(playfield)
		expect(cappedDecodeTarget(jpegBytes(6080, 8192), 4096)).toEqual(playfield)
		expect(cappedDecodeTarget(gifBytes(6080, 8192), 4096)).toEqual(playfield)
		expect(cappedDecodeTarget(bmpBytes(6080, 8192), 4096)).toEqual(playfield)
		expect(
			cappedDecodeTarget(
				webpBytes('VP8 ', d => {
					d[23] = 0x9d
					d[24] = 0x01
					d[25] = 0x2a
					d[26] = 0xc0
					d[27] = 0x17
					d[28] = 0x00
					d[29] = 0x20
				}),
				4096,
			),
		).toEqual(playfield)
		expect(
			cappedDecodeTarget(
				webpBytes('VP8L', d => {
					d[20] = 0x2f
					d[21] = 0xbf
					d[22] = 0xd7
					d[23] = 0xff
					d[24] = 0x07
				}),
				4096,
			),
		).toEqual(playfield)
		expect(
			cappedDecodeTarget(
				webpBytes('VP8X', d => {
					d[24] = 0xbf
					d[25] = 0x17
					d[26] = 0x00
					d[27] = 0xff
					d[28] = 0x1f
					d[29] = 0x00
				}),
				4096,
			),
		).toEqual(playfield)
	})

	it('returns null when within cap, truncated, or unrecognized', () => {
		expect(cappedDecodeTarget(pngBytes(64, 64), 4096)).toBeNull()
		expect(cappedDecodeTarget(new Uint8Array(4), 4096)).toBeNull()
		expect(cappedDecodeTarget(new Uint8Array(32), 4096)).toBeNull()
	})

	it('resolves top-down (negative-height) BMP dims by magnitude', () => {
		// Negative DIB height means top-down row order; the extent is the magnitude.
		expect(probeEncodedSize(bmpBytes(6080, -8192))).toEqual({ width: 6080, height: 8192 })
		expect(cappedDecodeTarget(bmpBytes(6080, -8192), 4096)).toEqual({ width: 3040, height: 4096 })
	})

	it('stays bounded when the header claims huge and every resize hint is ignored', async () => {
		vi.mocked(hasImageWorker).mockReturnValue(false)
		vi.mocked(decodeInWorker).mockClear()
		// Engine ignores resize at every tier: full-res back from blob and bitmap sources alike.
		const cib = vi.fn(async () => ({ width: 6080, height: 8192, close() {} }))
		vi.stubGlobal('createImageBitmap', cib)
		// No ImageDecoder stub: decodeMainAtSize throws and the oversize bitmap falls through.
		// loadAsync lives on Loader.prototype (TextureLoader inherits it): spy where it is owned.
		const { Loader } = await import('three')
		const loadSpy = vi
			.spyOn(Loader.prototype as any, 'loadAsync')
			.mockResolvedValue({ image: { width: 6080, height: 8192 } } as any)
		try {
			vi.stubGlobal('document', {
				createElement: (tag: string) => {
					expect(tag).toBe('canvas')
					return { width: 0, height: 0, getContext: () => ({ drawImage() {} }) }
				},
			})
			const tex = (await loader.loadTexture('playfield_image', '.png', pngBytes(6080, 8192))) as any
			expect(decodeInWorker).not.toHaveBeenCalled()
			// Sized blob decode + two-step bitmap resize, then the TextureLoader canvas tier.
			expect(cib).toHaveBeenCalledTimes(2)
			expect(tex.image.width).toBe(3040)
			expect(tex.image.height).toBe(4096)
		} finally {
			loadSpy.mockRestore()
			vi.unstubAllGlobals()
		}
	})
})
