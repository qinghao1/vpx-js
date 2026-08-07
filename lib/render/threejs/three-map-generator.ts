// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Texture as ThreeTexture } from '../../refs.node.js'
import { logger, progress } from '../../util/logger.js'
import type { Table } from '../../vpt/table/table.js'
import type { Texture } from '../../vpt/texture.js'
import type { ITextureLoader } from '../irender-api.js'

export class ThreeMapGenerator {
	private readonly textureLoader: ITextureLoader<ThreeTexture> | undefined
	private readonly textureCache: Map<string, ThreeTexture> = new Map()

	constructor(textureLoader: ITextureLoader<ThreeTexture> | undefined) {
		this.textureLoader = textureLoader
	}

	public async loadTextures(textures: Texture[], table: Table): Promise<void> {
		if (!this.textureLoader) {
			return Promise.resolve()
		}
		const now = Date.now()
		logger().debug('[ThreeMapGenerator.loadTextures] Pre-loading textures..')
		const concurrency = 6
		let index = 0
		const loadOne = async (): Promise<void> => {
			while (true) {
				const i = index++
				if (i >= textures.length) break
				const texture = textures[i]
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
		}
		await Promise.all(Array.from({ length: Math.min(concurrency, textures.length) }, () => loadOne()))
		logger().debug('[ThreeMapGenerator.loadTextures] Loaded in %sms.', Date.now() - now)
	}

	public getTexture(name: string): ThreeTexture {
		return this.textureCache.get(name)!
	}

	public hasTexture(name: string): boolean {
		return this.textureCache.has(name)
	}
}
