import { Texture } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { TableBuilder } from '../../../test/table-builder.js'
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

describe('ThreeMapGenerator.loadTextures', () => {
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
