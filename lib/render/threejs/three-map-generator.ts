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
		const started = Date.now()
		logger().debug('[ThreeMapGenerator.loadTextures] Pre-loading %s textures..', textures.length)
		this.setPlayfieldHint(table)

		const concurrency = this.pickConcurrency(textures)
		await this.loadConcurrently(textures, table, concurrency)

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
		const hasLarge = textures.some(t => t.width * t.height > 4 * 1024 * 1024)
		const hasFloat = textures.some(t => (t as any).isHdr?.() || /\.(exr|hdr)$/i.test((t as any).szPath ?? ''))
		const cores = (typeof navigator !== 'undefined' && (navigator as any).hardwareConcurrency) || 4
		if ((globalThis as unknown as { __vpxCameraAnimating?: boolean }).__vpxCameraAnimating) return 1
		if (hasFloat) return Math.min(2, cores)
		if (hasLarge) return Math.min(2, cores)
		return Math.min(3, cores)
	}

	private async loadConcurrently(textures: Texture[], table: Table, concurrency: number): Promise<void> {
		let next = 0
		const workers = Array.from({ length: Math.min(concurrency, textures.length) }, async () => {
			while (true) {
				await this.waitIfAnimating()
				const i = next++
				if (i >= textures.length) break
				await this.loadOne(textures[i]!, table)
				await this.yieldMain()
			}
		})
		await Promise.all(workers)
	}

	private async loadOne(texture: Texture, table: Table): Promise<void> {
		try {
			const tex = await texture.loadTexture(this.textureLoader!, table)
			this.textureCache.set(texture.getName(), tex)
			progress().details(texture.getName())
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
		}
	}

	private async waitIfAnimating(): Promise<void> {
		const g = globalThis as unknown as { __vpxCameraAnimating?: boolean; __vpxAnimPromise?: Promise<void> }
		if (g.__vpxCameraAnimating && g.__vpxAnimPromise) {
			try {
				await g.__vpxAnimPromise
			} catch {}
		} else if ((globalThis as unknown as { __vpxCameraAnimating?: boolean }).__vpxCameraAnimating) {
			await new Promise<void>(r =>
				setTimeout(function check() {
					if (!(globalThis as unknown as { __vpxCameraAnimating?: boolean }).__vpxCameraAnimating) r()
					else setTimeout(check, 16)
				}, 16),
			)
		}
	}

	private async yieldMain(): Promise<void> {
		await this.waitIfAnimating()
		const g = globalThis as unknown as { scheduler?: { yield?: () => Promise<void> } }
		if (typeof requestAnimationFrame === 'function') {
			await new Promise<void>(r => requestAnimationFrame(() => r()))
			if (g.scheduler?.yield) await g.scheduler.yield()
			else await new Promise<void>(rr => setTimeout(rr, 0))
		} else if (g.scheduler?.yield) await g.scheduler.yield()
		else await new Promise<void>(r => setTimeout(r, 0))
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
