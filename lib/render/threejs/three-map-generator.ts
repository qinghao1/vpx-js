// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Texture as ThreeTexture } from '../../refs.node.js'
import { logger, progress } from '../../util/logger.js'
import type { Table } from '../../vpt/table/table.js'
import type { Texture } from '../../vpt/texture.js'
import type { ITextureLoader } from '../irender-api.js'

/** Caches and preloads Three.js textures. */
export class ThreeMapGenerator {
	private readonly textureCache = new Map<string, ThreeTexture>()

	constructor(private readonly textureLoader?: ITextureLoader<ThreeTexture>) {}

	public async loadTextures(textures: Texture[], table: Table): Promise<void> {
		if (!this.textureLoader) return
		const now = Date.now()
		logger().debug('[ThreeMapGenerator.loadTextures] Pre-loading %s textures..', textures.length)
		try {
			const anyLoader = this.textureLoader as any
			if (anyLoader && 'playfieldMap' in anyLoader) anyLoader.playfieldMap = table.getPlayfieldMap()
		} catch {}
		const hasLarge = textures.some((t) => t.width * t.height > 4 * 1024 * 1024)
		const hasFloat = textures.some((t) => (t as any).isHdr?.() || /\.(exr|hdr)$/i.test((t as any).szPath || ''))
		const hw = (typeof navigator !== 'undefined' && (navigator as any).hardwareConcurrency) || 4
		const concurrency = hasLarge ? Math.min(2, hw) : hasFloat ? Math.min(3, hw) : Math.min(6, hw)
		let index = 0
		const worker = async (): Promise<void> => {
			while (true) {
				const i = index++
				if (i >= textures.length) break
				const texture = textures[i]!
				try {
					const tex = await texture.loadTexture(this.textureLoader!, table)
					this.textureCache.set(texture.getName(), tex)
					progress().details(texture.getName())
				} catch (err) {
					const msg = (err as Error).message || ''
					const args = [texture.getName(), texture.storageName, msg] as const
					if (msg.includes('too large'))
						logger().debug('[ThreeMapGenerator.loadTextures] Skipping large texture %s (%s): %s', ...args)
					else
						logger().warn(
							'[ThreeMapGenerator.loadTextures] Error loading texture %s (%s/%s): %s',
							texture.getName(),
							texture.storageName,
							texture.getName(),
							msg,
						)
				}
				if (i % 8 === 0) {
					try {
						if ((globalThis as any).scheduler?.yield) await (globalThis as any).scheduler.yield()
						else await new Promise<void>((r) => setTimeout(r, 0))
					} catch {}
				}
			}
		}
		await Promise.all(Array.from({ length: Math.min(concurrency, textures.length) }, () => worker()))
		logger().debug(
			'[ThreeMapGenerator.loadTextures] Loaded %s/%s textures in %sms (concurrency %s).',
			this.textureCache.size,
			textures.length,
			Date.now() - now,
			concurrency,
		)
		if (this.textureCache.size < textures.length) {
			logger().warn(
				'[ThreeMapGenerator.loadTextures] %s textures failed to load (check harness log for details)',
				textures.length - this.textureCache.size,
			)
		}
	}

	public getTexture(name: string): ThreeTexture {
		return this.textureCache.get(name)!
	}

	public hasTexture(name: string): boolean {
		return this.textureCache.has(name)
	}

	public disposeUnused(usedNames: Set<string>): number {
		let disposed = 0
		for (const [name, tex] of this.textureCache.entries()) {
			if (usedNames.has(name) || usedNames.has(name.toLowerCase())) continue
			this.disposeTexture(tex)
			this.textureCache.delete(name)
			disposed++
		}
		return disposed
	}

	public clear(): void {
		for (const tex of this.textureCache.values()) this.disposeTexture(tex)
		this.textureCache.clear()
	}

	private disposeTexture(tex: ThreeTexture): void {
		try {
			;(tex as unknown as { dispose?: () => void }).dispose?.()
		} catch {}
		try {
			const img = (tex as unknown as { image?: { data?: unknown } }).image
			if (img?.data) (tex as unknown as { image: { data: unknown | null } }).image.data = null
		} catch {}
	}
}
