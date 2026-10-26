import { BoxGeometry, DataTexture, Group, Mesh, Texture } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { TableBuilder } from '../../../test/table-builder.js'
import { Texture as VptTexture } from '../../vpt/texture.js'
import { cloneMaterialForWrite } from './material-shared.js'
import { createPrimitiveBdlMaterial } from './nodes/primitive-bdl-node.js'
import { ThreeMapGenerator } from './three-map-generator.js'
import { ThreeNodeMaterialGenerator } from './three-node-material-generator.js'

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
})

describe('ThreeMapGenerator.loadTextures', () => {
	function stubLoader(failName?: string) {
		return {
			loadTexture: async () => new Texture(),
			loadRawTexture: async () => new Texture(),
			loadDefaultTexture: async (name: string) => {
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

	it('pins the scene-resolve contract the viewer stream path relies on', () => {
		// Forked scene materials never enter the cache, so cache-only resolve
		// misses them; the viewer must route stream/demand resolve through
		// resolvePendingInScene(tableGroup) (plus cache-only for detached mats).
		const textures = new Map<string, DataTexture>()
		const generator = new ThreeNodeMaterialGenerator({
			hasTexture: (name: string) => textures.has(name.toLowerCase()),
			getTexture: (name: string) => textures.get(name.toLowerCase()),
		} as any)
		const mat: any = (generator as any).getMaterial(
			{ name: 'Some_Primitive', baseColor: 0xffffff } as any,
			'scriptimage',
		)
		expect(mat.userData.pendingMap).toEqual('scriptimage')
		const fork: any = cloneMaterialForWrite(mat)
		expect(Object.values((generator as any).cachedMaterials)).not.toContain(fork)
		const group = new Group()
		group.add(new Mesh(new BoxGeometry(1, 1, 1), fork))
		textures.set('scriptimage', new DataTexture(new Uint8Array([10, 20, 30, 255]), 1, 1))
		generator.resolvePendingTextures()
		expect(fork.userData.pendingMap, 'cache-only resolve misses the fork').toEqual('scriptimage')
		expect(generator.resolvePendingInScene(group), 'scene resolve binds the fork').toEqual(1)
		expect(fork.userData.pendingMap).toBeUndefined()
		expect(fork.userData.__map).toBe(textures.get('scriptimage'))
	})

	it('never stashes pendingEmissiveMap on primitive node materials', () => {
		// Primitives carry no emissive path: the arrival branch deletes this
		// key unbound and no resolver consumes it, so stashing it only makes
		// demandPendingMaps load a texture nobody binds.
		const textures = new Map<string, DataTexture>()
		const generator = new ThreeNodeMaterialGenerator({
			hasTexture: (name: string) => textures.has(name.toLowerCase()),
			getTexture: (name: string) => textures.get(name.toLowerCase()),
		} as any)
		const mat: any = createPrimitiveBdlMaterial({ albedo: 0xffffff, opacity: 1, bdl: 0 })
		generator.applyEmissiveMap(mat, { name: 'p', baseColor: 0xffffff } as any, 'emissiveonly')
		expect(mat.userData.pendingEmissiveMap).toBeUndefined()
	})

	it('resolves script-applied normal/env/emissive maps on baked materials', () => {
		// The arrival path binds these via the classic slots, so resolve must
		// too — otherwise a baked material whose script-applied map arrives via
		// stream/demand stays stranded with its pending key forever.
		const textures = new Map<string, DataTexture>()
		const generator = new ThreeNodeMaterialGenerator({
			hasTexture: (name: string) => textures.has(name.toLowerCase()),
			getTexture: (name: string) => textures.get(name.toLowerCase()),
		} as any)
		// A referenced (still streaming) bake texture keeps the material on the
		// unlit baked path; a bake name with no texture reference at all renders
		// lit instead (upstream lit live-part parity).
		const mat: any = (generator as any).getMaterial({ name: 'VLM.Bake', baseColor: 0xffffff } as any, 'bakemap')
		expect(mat.userData.__isBaked).toBe(true)
		generator.applyNormalMap(mat, 'bakenormal')
		generator.applyEnvMap(mat, 'bakeenv')
		generator.applyEmissiveMap(mat, { name: 'VLM.Bake', baseColor: 0xffffff } as any, 'bakeemissive')
		expect(mat.userData.pendingNormalMap).toEqual('bakenormal')
		const tex = new DataTexture(new Uint8Array([10, 20, 30, 255]), 1, 1)
		textures.set('bakenormal', tex)
		textures.set('bakeenv', tex)
		textures.set('bakeemissive', tex)
		expect(generator.resolvePendingTextures()).toEqual(3)
		expect(mat.userData.pendingNormalMap).toBeUndefined()
		expect(mat.userData.pendingEnvMap).toBeUndefined()
		expect(mat.userData.pendingEmissiveMap).toBeUndefined()
		expect(mat.normalMap).toBe(tex)
		expect(mat.envMap).toBe(tex)
		expect(mat.emissiveMap).toBe(tex)
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
})
