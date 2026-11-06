import { Texture } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { TableBuilder } from '../../../test/table-builder.js'
import { Logger } from '../../util/logger.js'
import { Texture as VptTexture } from '../../vpt/texture.js'
import { ThreeMapGenerator } from './three-map-generator.js'

describe('ThreeMapGenerator.disposeUnused', () => {
	it('disposes each cached texture exactly once despite exact + lowercase keys', () => {
		const generator = new ThreeMapGenerator()
		const mixedTexture = new Texture()
		const plainTexture = new Texture()
		const mixedDispose = vi.spyOn(mixedTexture, 'dispose')
		const plainDispose = vi.spyOn(plainTexture, 'dispose')
		generator.getCache().set('MyTex', mixedTexture)
		generator.getCache().set('mytex', mixedTexture)
		generator.getCache().set('plain', plainTexture)

		const disposed = generator.disposeUnused(new Set())

		expect(mixedDispose).toHaveBeenCalledTimes(1)
		expect(plainDispose).toHaveBeenCalledTimes(1)
		expect(disposed).toEqual(2)
		expect(generator.getCache().size).toEqual(0)
	})

	it('clear disposes each cached texture exactly once despite dual keys', () => {
		const generator = new ThreeMapGenerator()
		const tex = new Texture()
		const dispose = vi.spyOn(tex, 'dispose')
		generator.getCache().set('MyTex', tex)
		generator.getCache().set('mytex', tex)
		generator.clear()
		expect(dispose).toHaveBeenCalledTimes(1)
		expect(generator.getCache().size).toEqual(0)
	})

	it('keeps textures whose name is still used', () => {
		const generator = new ThreeMapGenerator()
		const keptTexture = new Texture()
		const keptDispose = vi.spyOn(keptTexture, 'dispose')
		generator.getCache().set('Kept', keptTexture)
		generator.getCache().set('kept', keptTexture)

		const disposed = generator.disposeUnused(new Set(['kept']))

		expect(disposed).toEqual(0)
		expect(keptDispose).not.toHaveBeenCalled()
		expect(generator.getCache().size).toEqual(2)
	})
})

describe('ThreeMapGenerator.getTexture', () => {
	it('prefers the exact-case entry and falls back case-insensitively', () => {
		const generator = new ThreeMapGenerator()
		const exactTexture = new Texture()
		const lowerTexture = new Texture()
		generator.getCache().set('MyTex', exactTexture)
		generator.getCache().set('mytex', lowerTexture)

		expect(generator.getTexture('MyTex')).toBe(exactTexture)
		expect(generator.getTexture('mytex')).toBe(lowerTexture)
		expect(generator.getTexture('MYTEX')).toBe(lowerTexture)
		expect(generator.getTexture('mYtEx')).toBe(lowerTexture)
		expect(generator.hasTexture('mYtEx')).toBe(true)
		expect(generator.hasTexture('missing')).toBe(false)
	})

	it('returns undefined for names never cached', () => {
		const generator = new ThreeMapGenerator()
		expect(generator.getTexture('missing')).toBeUndefined()
	})
})

function stubLoader(failName?: string, onName?: (name: string) => void) {
	return {
		loadTexture: async () => new Texture(),
		loadRawTexture: async () => new Texture(),
		loadDefaultTexture: async (name: string) => {
			onName?.(name)
			if (name === failName) throw new Error('decode boom')
			return new Texture()
		},
	}
}

describe('ThreeMapGenerator.loadTextures', () => {
	it('caches arrivals under exact and lowercase names retrievable any-case', async () => {
		const table = new TableBuilder().build()
		const generator = new ThreeMapGenerator(stubLoader() as any)
		const texA = VptTexture.fromFilesystem('Playfield.png')
		const texB = VptTexture.fromFilesystem('Insert.png')
		const outcomes: Array<[string, boolean]> = []
		await generator.loadTextures([texA, texB], table, (tex, ok) => {
			outcomes.push([tex.getName(), ok])
		})

		expect(generator.getCache().size).toEqual(4)
		expect(generator.getTexture('Playfield.png')).toBe(generator.getTexture('playfield.png'))
		expect(generator.hasTexture('INSERT.PNG')).toBe(true)
		expect(outcomes.sort()).toEqual([
			['Insert.png', true],
			['Playfield.png', true],
		])
	})

	it('reports a failing texture via onTexture(false) and still loads the rest', async () => {
		const table = new TableBuilder().build()
		const good = VptTexture.fromFilesystem('Good.png')
		const bad = VptTexture.fromFilesystem('Bad.png')
		const generator = new ThreeMapGenerator(stubLoader('Bad.png') as any)
		const outcomes: Array<[string, boolean]> = []
		await expect(
			generator.loadTextures([good, bad], table, (tex, ok) => {
				outcomes.push([tex.getName(), ok])
			}),
		).resolves.toBeUndefined()

		expect(outcomes.sort()).toEqual([
			['Bad.png', false],
			['Good.png', true],
		])
		expect(generator.hasTexture('Good.png')).toBe(true)
		expect(generator.hasTexture('Bad.png')).toBe(false)
		expect(generator.getCache().size).toEqual(2)
	})

	it('dispatches playfield textures before others, keeping stable order', async () => {
		const table = new TableBuilder().build()
		const started: string[] = []
		const generator = new ThreeMapGenerator(stubLoader(undefined, n => started.push(n)) as any)
		await generator.loadTextures(
			[
				VptTexture.fromFilesystem('WallA.png'),
				VptTexture.fromFilesystem('WallB.png'),
				VptTexture.fromFilesystem('VLM.Nestmap0'),
				VptTexture.fromFilesystem('WallC.png'),
			],
			table,
		)

		expect(started).toEqual(['VLM.Nestmap0', 'WallA.png', 'WallB.png', 'WallC.png'])
	})

	function sizedTexture(name: string, bytes: number) {
		const tex = VptTexture.fromFilesystem(name)
		;(tex as any).binary = { pos: 0, len: bytes }
		return tex
	}

	it('dispatches sub-1MB textures before mediums and tails >16MB giants', async () => {
		const table = new TableBuilder().build()
		const started: string[] = []
		const generator = new ThreeMapGenerator(stubLoader(undefined, n => started.push(n)) as any)
		await generator.loadTextures(
			[
				sizedTexture('GiantA.png', 30 << 20),
				sizedTexture('SmallA.png', 100 << 10),
				sizedTexture('Medium.png', 5 << 20),
				sizedTexture('GiantB.png', 20 << 20),
				sizedTexture('SmallB.png', 50 << 10),
			],
			table,
		)

		expect(started.slice(-2)).toEqual(['GiantA.png', 'GiantB.png'])
		const at = (n: string) => started.indexOf(n)
		expect(Math.max(at('SmallA.png'), at('SmallB.png'))).toBeLessThan(at('Medium.png'))
		expect(at('Medium.png')).toBeLessThan(Math.min(at('GiantA.png'), at('GiantB.png')))
	})

	it('pins the first playfield bake at the head and tails the remaining giants', async () => {
		const table = new TableBuilder().build()
		const started: string[] = []
		const generator = new ThreeMapGenerator(stubLoader(undefined, n => started.push(n)) as any)
		await generator.loadTextures(
			[
				sizedTexture('WallA.png', 100 << 10),
				sizedTexture('Playfield.png', 30 << 20),
				sizedTexture('VLM.Nestmap0', 25 << 20),
				sizedTexture('WallB.png', 50 << 10),
			],
			table,
		)

		expect(started[0]).toEqual('Playfield.png')
		expect(started.slice(-1)).toEqual(['VLM.Nestmap0'])
		const at = (n: string) => started.indexOf(n)
		expect(Math.max(at('WallA.png'), at('WallB.png'))).toBeLessThan(at('VLM.Nestmap0'))
	})

	it('dispatches a same-band playfield bake before a non-playfield medium', async () => {
		const table = new TableBuilder().build()
		const started: string[] = []
		const generator = new ThreeMapGenerator(stubLoader(undefined, n => started.push(n)) as any)
		await generator.loadTextures(
			[
				sizedTexture('VLM.Nestmap0', 100 << 10),
				sizedTexture('SmallA.png', 100 << 10),
				sizedTexture('Wall.png', 5 << 20),
				sizedTexture('Bake.png', 5 << 20),
			],
			table,
		)

		// VLM.Nestmap0 absorbs the head pin (and is small anyway), so Bake.png
		// reaching Wall.png proves within-band playfield-first, not the pin.
		expect(started).toEqual(['VLM.Nestmap0', 'SmallA.png', 'Bake.png', 'Wall.png'])
	})

	it('treats exactly 1MB and exactly 16MB as medium band', async () => {
		const table = new TableBuilder().build()
		const started: string[] = []
		const generator = new ThreeMapGenerator(stubLoader(undefined, n => started.push(n)) as any)
		await generator.loadTextures(
			[
				sizedTexture('Giant.png', (16 << 20) + 1),
				sizedTexture('Edge1.png', 1 << 20),
				sizedTexture('Edge16.png', 16 << 20),
				sizedTexture('Small.png', (1 << 20) - 1),
			],
			table,
		)

		expect(started).toEqual(['Small.png', 'Edge1.png', 'Edge16.png', 'Giant.png'])
	})

	it('reports per-call totals, not cumulative cache size', async () => {
		const table = new TableBuilder().build()
		const generator = new ThreeMapGenerator(stubLoader() as any)
		const infos: Array<{ f: string; a: unknown[] }> = []
		const prev = Logger.logger()
		Logger.setLogger({
			wtf: () => {},
			error: () => {},
			warn: () => {},
			debug: () => {},
			info: (f: string, ...a: unknown[]) => {
				infos.push({ f, a })
			},
		})
		try {
			const outcomes: Array<[string, boolean]> = []
			const onTexture = (tex: { getName(): string }, ok: boolean) => {
				outcomes.push([tex.getName(), ok])
			}
			await generator.loadTextures(
				[VptTexture.fromFilesystem('A.png'), VptTexture.fromFilesystem('B.png')],
				table,
				onTexture,
			)
			await generator.loadTextures([VptTexture.fromFilesystem('C.png')], table, onTexture)

			const loadedLogs = infos.filter(e => e.f.includes('Loaded'))
			expect(loadedLogs.map(e => [e.a[0], e.a[1]])).toEqual([
				[2, 2],
				[1, 1],
			])
			expect(outcomes.sort()).toEqual([
				['A.png', true],
				['B.png', true],
				['C.png', true],
			])
		} finally {
			Logger.setLogger(prev)
		}
	})

	it('warms the HDR pool only when float textures are queued', async () => {
		const table = new TableBuilder().build()
		const warmup = vi.fn()
		const generator = new ThreeMapGenerator({ ...stubLoader(), warmup } as any)
		await generator.loadTextures([VptTexture.fromFilesystem('env.hdr')], table)
		expect(warmup).toHaveBeenCalledTimes(1)
		const idle = new ThreeMapGenerator({ ...stubLoader(), warmup } as any)
		warmup.mockClear()
		await idle.loadTextures([VptTexture.fromFilesystem('WallA.png')], table)
		expect(warmup).not.toHaveBeenCalled()
	})
})

describe('ThreeMapGenerator.retainSources', () => {
	function fakeTexture(name: string, opts: { raw?: boolean; len?: number } = {}) {
		return {
			getName: () => name,
			isRaw: () => opts.raw ?? false,
			isHdr: () => false,
			isOpaque: true,
			storageName: 'Image1',
			binary: opts.len === undefined ? undefined : { pos: 8, len: opts.len },
			retainedData: undefined as Uint8Array | null | undefined,
			loadTexture: VptTexture.prototype.loadTexture,
		}
	}

	it('stashes archive bytes on uncached sourced textures only', async () => {
		const generator = new ThreeMapGenerator(stubLoader() as any)
		const cached = fakeTexture('Cached.png', { len: 100 })
		generator.getCache().set('cached.png', new Texture())
		const small = fakeTexture('Small.png', { len: 100 })
		const raw = fakeTexture('Raw.png', { raw: true, len: 100 })
		const naked = fakeTexture('Naked.png')
		let reads = 0
		const table = {
			streamStorage: async () => {
				reads++
				return new Uint8Array(100)
			},
		}
		const result = await generator.retainSources(
			[cached as any, small as any, raw as any, naked as any],
			table as any,
		)
		expect(result).toEqual({ retained: 1, bytes: 100 })
		expect(reads).toEqual(1)
		expect(small.retainedData).toBeInstanceOf(Uint8Array)
		expect(cached.retainedData).toBeUndefined()
		expect(raw.retainedData).toBeUndefined()
		expect(naked.retainedData).toBeUndefined()
	})

	it('serves retained bytes without re-reading the archive, then drains', async () => {
		const seen: Uint8Array[] = []
		const loader = {
			...stubLoader(),
			loadTexture: async (_name: string, _ext: string, data: Uint8Array) => {
				seen.push(data)
				return new Texture()
			},
		}
		const generator = new ThreeMapGenerator(loader as any)
		const bytes = new Uint8Array([1, 2, 3])
		const tex = fakeTexture('Swap.png', { len: 3 })
		await generator.retainSources([tex as any], { streamStorage: async () => bytes } as any)
		// Archive released: further reads throw, like the released OLE reader.
		const deadTable = {
			streamStorage: async (): Promise<Uint8Array> => {
				throw new Error('BinaryReader: data already consumed and not available')
			},
		}
		const outcomes: Array<[string, boolean]> = []
		await generator.loadTextures([tex as any], deadTable as any, (t, ok) => {
			outcomes.push([(t as unknown as { getName(): string }).getName(), ok])
		})
		expect(outcomes).toEqual([['Swap.png', true]])
		expect(seen).toEqual([bytes])
		expect(tex.retainedData).toBeUndefined()
	})

	it('names textures whose sources cannot be retained', async () => {
		const generator = new ThreeMapGenerator(stubLoader() as any)
		const good = fakeTexture('Good.png', { len: 10 })
		const bad = fakeTexture('Bad.png', { len: 10 })
		const debugs: Array<{ f: string; a: unknown[] }> = []
		const prev = Logger.logger()
		Logger.setLogger({
			wtf: () => {},
			error: () => {},
			warn: () => {},
			info: () => {},
			debug: (f: string, ...a: unknown[]) => {
				debugs.push({ f, a })
			},
		})
		try {
			let reads = 0
			const result = await generator.retainSources([good as any, bad as any], {
				streamStorage: async () => {
					if (++reads === 2) throw new Error('boom')
					return new Uint8Array(10)
				},
			} as any)
			expect(result).toEqual({ retained: 1, bytes: 10 })
			expect(good.retainedData).toBeInstanceOf(Uint8Array)
			expect(bad.retainedData).toBeUndefined()
			expect(debugs.map(e => [e.f, ...e.a])).toEqual([
				[
					'[ThreeMapGenerator.loadTextures] Could not retain %s texture sources (%s); their demand loads fail once the archive is released.',
					1,
					'Bad.png',
				],
			])
		} finally {
			Logger.setLogger(prev)
		}
	})
})

describe('ThreeMapGenerator.loadShared', () => {
	it('shares one loader call across concurrent duplicate names', async () => {
		const table = new TableBuilder().build()
		let calls = 0
		const loader = {
			loadTexture: async () => new Texture(),
			loadRawTexture: async () => new Texture(),
			loadDefaultTexture: async () => {
				calls++
				await new Promise(r => setTimeout(r, 20))
				return new Texture()
			},
		}
		const generator = new ThreeMapGenerator(loader as any)
		const outcomes: Array<[string, boolean]> = []
		await generator.loadTextures(
			[VptTexture.fromFilesystem('Dup.png'), VptTexture.fromFilesystem('dup.PNG')],
			table,
			(tex, ok) => {
				outcomes.push([tex.getName(), ok])
			},
		)

		expect(calls).toEqual(1)
		expect(outcomes).toEqual([
			['Dup.png', true],
			['dup.PNG', true],
		])
	})

	it('does not re-attempt a failed texture inside the cooldown', async () => {
		const table = new TableBuilder().build()
		let calls = 0
		const loader = {
			loadTexture: async () => new Texture(),
			loadRawTexture: async () => new Texture(),
			loadDefaultTexture: async () => {
				calls++
				throw new Error('decode boom')
			},
		}
		const generator = new ThreeMapGenerator(loader as any)
		const bad = VptTexture.fromFilesystem('Bad.png')
		await generator.loadTextures([bad], table)
		await generator.loadTextures([bad], table)

		expect(calls).toEqual(1)
		expect(generator.hasTexture('Bad.png')).toBe(false)
	})

	it('serves a repeat pass over a source-cleared texture from cache', async () => {
		const payload = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
		const stream = new Uint8Array(16 + payload.length)
		stream.set(payload, 16)
		const reads: Array<[number, number]> = []
		const table = {
			streamStorage: async (_name: string, next: (storage: unknown) => Promise<Uint8Array>) =>
				next({
					read: async (_key: string, offset = 0, len?: number) => {
						len ??= stream.length - offset
						reads.push([offset, len])
						return stream.slice(offset, offset + len)
					},
				}),
		} as any
		let calls = 0
		const loader = {
			loadTexture: async () => {
				calls++
				return new Texture()
			},
			loadRawTexture: async () => new Texture(),
			loadDefaultTexture: async () => new Texture(),
		}
		const generator = new ThreeMapGenerator(loader as any)
		const tex = new (VptTexture as any)()
		tex.storageName = 'Image105'
		tex.szName = 'Clearedtex'
		tex.szPath = 'cleared.png'
		tex.isOpaque = true
		tex.binary = { pos: 16, len: payload.length }
		const outcomes: Array<[string, boolean]> = []
		const onTexture = (loaded: { getName(): string }, ok: boolean) => {
			outcomes.push([loaded.getName(), ok])
		}
		await generator.loadTextures([tex], table, onTexture)
		// The first pass consumes the source by design; the repeat pass over
		// the same object must hit the cache instead of re-reading a
		// source-less whole stream into the image decoder.
		expect(tex.binary).toBeUndefined()
		await generator.loadTextures([tex], table, onTexture)

		expect(calls).toEqual(1)
		expect(reads).toEqual([[16, payload.length]])
		expect(outcomes).toEqual([
			['clearedtex', true],
			['clearedtex', true],
		])
	})
})
