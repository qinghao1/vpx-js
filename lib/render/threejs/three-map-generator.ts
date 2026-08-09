// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Texture as ThreeTexture } from '../../refs.node.js'
import { type AnimationGate, animationGate } from '../../util/animation-gate.js'
import { logger, progress } from '../../util/logger.js'
import type { Table } from '../../vpt/table/table.js'
import type { Texture } from '../../vpt/texture.js'
import type { ITextureLoader } from '../irender-api.js'

const LARGE_TEXTURE_PIXELS = 4 * 1024 * 1024
const CONCURRENCY_ANIMATING = 4
const CONCURRENCY_HEAVY = 3
const CONCURRENCY_DEFAULT = 6

/** Caches and preloads Three.js textures. */
export class ThreeMapGenerator {
	private readonly textureCache = new Map<string, ThreeTexture>()

	constructor(
		private readonly textureLoader?: ITextureLoader<ThreeTexture>,
		private readonly gate: AnimationGate = animationGate,
	) {}

	public async loadTextures(
		textures: Texture[],
		table: Table,
		onTexture?: (tex: Texture, ok: boolean) => void,
	): Promise<void> {
		if (!this.textureLoader) return
		if (!textures.length) return
		const started = Date.now()
		logger().debug('[ThreeMapGenerator.loadTextures] Pre-loading %s textures..', textures.length)
		this.setPlayfieldHint(table)

		const concurrency = this.pickConcurrency(textures)
		await this.loadConcurrently(textures, table, concurrency, onTexture)

		logger().debug(
			'[ThreeMapGenerator.loadTextures] Loaded %s/%s textures in %sms (concurrency %s).',
			this.textureCache.size,
			textures.length,
			Date.now() - started,
			concurrency,
		)
		if (this.textureCache.size < textures.length) {
			logger().warn(
				'[ThreeMapGenerator.loadTextures] %s textures failed to load (check harness log for details)',
				textures.length - this.textureCache.size,
			)
		}
	}

	private setPlayfieldHint(table: Table): void {
		const loader = this.textureLoader as unknown as { playfieldMap?: string }
		if (loader && 'playfieldMap' in loader) loader.playfieldMap = table.getPlayfieldMap()
	}

	private pickConcurrency(textures: Texture[]): number {
		const hasLarge = textures.some(t => t.width * t.height > LARGE_TEXTURE_PIXELS)
		const hasFloat = textures.some(t => (t as any).isHdr?.() || /\.(exr|hdr)$/i.test((t as any).szPath ?? ''))
		const cores = (typeof navigator !== 'undefined' && (navigator as any).hardwareConcurrency) || 4
		if (hasFloat) return Math.min(CONCURRENCY_HEAVY, cores)
		if (hasLarge) return Math.min(CONCURRENCY_HEAVY, cores)
		return Math.min(CONCURRENCY_DEFAULT, cores)
	}

	private async loadConcurrently(
		textures: Texture[],
		table: Table,
		concurrency: number,
		onTexture?: (tex: Texture, ok: boolean) => void,
	): Promise<void> {
		let next = 0
		const workers = Array.from({ length: Math.min(concurrency, textures.length) }, async () => {
			while (true) {
				await this.gate.waitIfAnimating()
				const i = next++
				if (i >= textures.length) break
				const ok = await this.loadOne(textures[i]!, table)
				onTexture?.(textures[i]!, ok)
				await this.gate.yieldToMain()
			}
		})
		await Promise.all(workers)
	}

	private async loadOne(texture: Texture, table: Table): Promise<boolean> {
		try {
			const tex = await texture.loadTexture(this.textureLoader!, table)
			this.textureCache.set(texture.getName(), tex)
			progress().details(texture.getName())
			return true
		} catch (err) {
			const msg = (err as Error).message || ''
			if (msg.includes('too large')) {
				logger().debug(
					'[ThreeMapGenerator.loadTextures] Skipping large texture %s (%s): %s',
					texture.getName(),
					texture.storageName,
					msg,
				)
			} else {
				logger().warn(
					'[ThreeMapGenerator.loadTextures] Error loading texture %s (%s/%s): %s',
					texture.getName(),
					texture.storageName,
					texture.getName(),
					msg,
				)
			}
			return false
		}
	}

	public getTexture(name: string): ThreeTexture {
		return this.textureCache.get(name)!
	}

	public hasTexture(name: string): boolean {
		return this.textureCache.has(name)
	}

	public getCache(): Map<string, ThreeTexture> {
		return this.textureCache
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
			;(tex as any).dispose?.()
		} catch {}
		try {
			const img = (tex as any).image
			if (img?.data) (tex as any).image.data = null
		} catch {}
	}
}
