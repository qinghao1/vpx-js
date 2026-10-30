// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Group, Material, Mesh, Texture as ThreeTexture } from 'three'
import { type AnimationGate, animationGate } from '../../util/animation-gate.js'
import { logger, progress } from '../../util/logger.js'
import type { Table } from '../../vpt/table/table.js'
import { Texture } from '../../vpt/texture.js'
import type { ITextureLoader } from '../irender-api.js'
import { normalizePendingKeys, PENDING_MAP_KEYS } from './material-shared.js'
import { isPlayfieldCap } from './texture-tags.js'

const HARDWARE_CONCURRENCY_FALLBACK = 4

/**
 * Cooldown before a failed texture is attempted (and warned about) again.
 * Demand passes re-scan on every updater batch, so without this one doomed
 * file (e.g. a 512MB EXR decode) is retried dozens of times per load.
 */
const LOAD_FAILURE_COOLDOWN_MS = 30000

/**
 * Caches and preloads Three.js textures. Each texture is cached under both
 * its exact and lowercased name because table authors reference textures
 * case-inconsistently; lookups must stay case-insensitive.
 */
export class ThreeMapGenerator {
	private readonly textureCache = new Map<string, ThreeTexture>()
	private readonly inFlight = new Map<string, Promise<boolean>>()
	private readonly lastFailureAt = new Map<string, number>()

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
		logger().info('[ThreeMapGenerator.loadTextures] Pre-loading %s textures..', textures.length)
		this.setPlayfieldHint(table)

		const concurrency = this.pickConcurrency()
		let loaded = 0
		await this.loadConcurrently(textures, table, concurrency, (tex, ok) => {
			if (ok) loaded++
			onTexture?.(tex, ok)
		})

		logger().info(
			'[ThreeMapGenerator.loadTextures] Loaded %s/%s textures in %sms (concurrency %s).',
			loaded,
			textures.length,
			Date.now() - started,
			concurrency,
		)
		if (loaded < textures.length) {
			logger().warn(
				'[ThreeMapGenerator.loadTextures] %s textures failed to load (check harness log for details)',
				textures.length - loaded,
			)
		}
	}

	private setPlayfieldHint(table: Table): void {
		const loader = this.textureLoader as unknown as { playfieldMap?: string }
		if (loader && typeof loader === 'object' && 'playfieldMap' in loader)
			loader.playfieldMap = table.getPlayfieldMap()
	}

	private pickConcurrency(): number {
		const cores =
			(typeof navigator !== 'undefined' && (navigator as any).hardwareConcurrency) ||
			HARDWARE_CONCURRENCY_FALLBACK
		return Math.max(1, Math.min(cores, 4))
	}

	private async loadConcurrently(
		textures: Texture[],
		table: Table,
		concurrency: number,
		onTexture?: (tex: Texture, ok: boolean) => void,
	): Promise<void> {
		// Playfield-first: the playfield bake unblocks first paint, so it
		// dispatches before thumbnails. Stable sort keeps the caller's order;
		// cached results are identical either way.
		const isPlayfield = textures.map(tex => isPlayfieldCap(tex.getName()))
		const order = textures.map((_, i) => i).sort((a, b) => Number(!isPlayfield[a]) - Number(!isPlayfield[b]))
		let next = 0
		const workers = Array.from({ length: Math.min(concurrency, textures.length) }, async () => {
			while (true) {
				if (this.gate.isAnimating()) await this.gate.waitIfAnimating()
				const slot = next++
				if (slot >= order.length) break
				const texIdx = order[slot]!
				const ok = await this.loadShared(textures[texIdx]!, table)
				onTexture?.(textures[texIdx]!, ok)
				if (slot % 2 === 0) await this.gate.yieldToMain()
			}
		})
		await Promise.all(workers)
	}

	private clearTextureSource(texture: Texture): void {
		// Best-effort cleanup: the source buffer simply stays referenced if unset fails.
		for (const field of ['binary', 'pdsBuffer', 'retainedData'] as const) {
			try {
				;(texture as any)[field] = undefined
			} catch {
				// Ignore — the source buffer simply stays referenced.
			}
		}
	}

	/**
	 * Loads one texture, sharing concurrent attempts on the same name and
	 * skipping re-attempts inside the failure cooldown (quietly — the first
	 * failure already warned, and demand passes re-scan every updater batch).
	 */
	private loadShared(texture: Texture, table: Table): Promise<boolean> {
		const key = texture.getName().toLowerCase()
		// Repeat passes over the same objects (scene rebuilds, duplicate
		// entries) must not re-read sources the first pass cleared: a
		// source-less re-read fetches the whole OLE stream, which the image
		// decoder rejects with a message-less DOM error event.
		if (this.hasTexture(texture.getName())) {
			return Promise.resolve(true)
		}
		const running = this.inFlight.get(key)
		if (running) return running
		if (Date.now() - (this.lastFailureAt.get(key) ?? 0) < LOAD_FAILURE_COOLDOWN_MS) {
			return Promise.resolve(false)
		}
		const attempt = this.loadOne(texture, table).finally(() => {
			if (this.inFlight.get(key) === attempt) this.inFlight.delete(key)
		})
		this.inFlight.set(key, attempt)
		return attempt
	}

	/**
	 * Snapshots archive sources of textures missing from the GPU cache, so
	 * later demand loads survive the reader release. Already cached, raw
	 * (decoded in memory), or source-less textures are skipped. Bytes live
	 * on the texture and die with the table; successful loads drain them.
	 */
	public async retainSources(textures: Texture[], table: Table): Promise<{ retained: number; bytes: number }> {
		let retained = 0
		let bytes = 0
		for (const texture of textures) {
			if (!texture.getName() || this.hasTexture(texture.getName()) || texture.isRaw() || texture.retainedData)
				continue
			const storageName = texture.storageName
			const pos = texture.binary?.pos
			const len = texture.binary?.len ?? 0
			if (!storageName || pos === undefined || len <= 0) continue
			try {
				const data = await table.streamStorage<Uint8Array>('GameStg', storage =>
					storage.read(storageName, pos, len),
				)
				if (data?.length) {
					texture.retainedData = data
					retained++
					bytes += data.length
				}
			} catch {
				// Unreadable now means unloadable later; the demand path warns then.
			}
		}
		return { retained, bytes }
	}

	private async loadOne(texture: Texture, table: Table): Promise<boolean> {
		try {
			const tex = await texture.loadTexture(this.textureLoader!, table)
			try {
				const rawCutout = !texture.isOpaque ? (texture.alphaTestValue ?? 0) : 0
				;(tex as any).userData = {
					...((tex as any).userData ?? {}),
					alphaTestValue: rawCutout > 0 && rawCutout <= 1 ? rawCutout : 0,
				}
			} catch {
				// Best-effort cleanup: alphaTest fallback stays in material userData if the texture is frozen.
			}
			this.textureCache.set(texture.getName(), tex)
			this.textureCache.set(texture.getName().toLowerCase(), tex)
			progress().details(texture.getName())
			this.clearTextureSource(texture)
			return true
		} catch (error) {
			this.lastFailureAt.set(texture.getName().toLowerCase(), Date.now())
			// Per-texture failure ("too large", decode failure, abort): log and return false
			// so remaining textures can still load, never reraise.
			// The source is intentionally NOT cleared here: demand retries re-read it, and clearing would turn a transient decode failure into a permanent one.
			// Image-decode rejections surface as DOM events with no message, so describe those instead of logging "[object Event]".
			const msg =
				(error as Error)?.message ||
				(typeof Event !== 'undefined' && error instanceof Event
					? `DOM ${error.type} event from image decoder`
					: String(error))
			const byteLen = texture.binary?.len ?? '?'
			if (msg.includes('too large')) {
				logger().debug(
					'[ThreeMapGenerator.loadTextures] Skipping large texture %s (%s): %s',
					texture.getName(),
					texture.storageName,
					msg,
				)
			} else {
				logger().warn(
					'[ThreeMapGenerator.loadTextures] Error loading texture %s (%s/%s, %s bytes): %s',
					texture.getName(),
					texture.storageName,
					texture.getName(),
					byteLen,
					msg,
				)
			}
			return false
		}
	}

	public getTexture(name: string): ThreeTexture | undefined {
		return this.textureCache.get(name) ?? this.textureCache.get(name.toLowerCase())
	}

	public hasTexture(name: string): boolean {
		return this.textureCache.has(name) || this.textureCache.has(name.toLowerCase())
	}

	public getCache(): Map<string, ThreeTexture> {
		return this.textureCache
	}

	/**
	 * Loads table textures for scene materials whose pending key missed the
	 * cache — typically images assigned by table script after the stream
	 * filter ran (e.g. `VRCab_Backbox.image = ...` in `Table1_Init`). The
	 * caller must resolve + rebind afterwards (`resolvePendingTextures`).
	 * Returns loaded names and names that cannot load (unknown texture or
	 * cleared/failed source); the caller should warn on the latter.
	 */
	public async demandPendingMaps(root: Group, table: Table): Promise<{ loaded: string[]; missing: string[] }> {
		const wanted = new Set<string>()
		root.traverse(o => {
			const mesh = o as Mesh
			if (!mesh.isMesh || !mesh.material) return
			for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
				const userData = (material as Material & { userData?: Record<string, unknown> }).userData
				if (userData) normalizePendingKeys(userData)
				for (const key of PENDING_MAP_KEYS) {
					const name = userData?.[key]
					if (typeof name === 'string' && name && !this.hasTexture(name)) wanted.add(name)
				}
			}
		})
		const loaded: string[] = []
		const missing: string[] = []
		const loadable: Texture[] = []
		for (const name of wanted) {
			const fromTable = table.getTexture(name)
			if (fromTable) {
				loadable.push(fromTable)
				continue
			}
			// Engine defaults (bumper/kicker/…) live in res/maps, not the table —
			// but only attempt names the loader actually ships, so deleted table
			// textures (glass*) report missing once instead of failing every cycle.
			const loader = this.textureLoader as unknown as {
				hasDefaultTexture?: (name: string) => boolean
			}
			if (loader?.hasDefaultTexture?.(name) ?? true) loadable.push(Texture.fromFilesystem(name))
			else missing.push(name)
		}
		await this.loadTextures(loadable, table, (tex, ok) => {
			if (ok) loaded.push(tex.getName())
			else missing.push(tex.getName())
		})
		return { loaded, missing }
	}

	public disposeUnused(usedNames: Set<string>): number {
		let disposed = 0
		const seen = new Set<ThreeTexture>()
		for (const [name, tex] of this.textureCache.entries()) {
			if (usedNames.has(name) || usedNames.has(name.toLowerCase())) continue
			this.textureCache.delete(name)
			if (seen.has(tex)) continue
			seen.add(tex)
			this.disposeTexture(tex)
			disposed++
		}
		return disposed
	}

	public clear(): void {
		const seen = new Set<ThreeTexture>()
		for (const tex of this.textureCache.values()) {
			if (seen.has(tex)) continue
			seen.add(tex)
			this.disposeTexture(tex)
		}
		this.textureCache.clear()
	}

	private disposeTexture(tex: ThreeTexture): void {
		;(tex as any).dispose?.()
		const img = (tex as any).image
		if (img?.data) (tex as any).image.data = null
	}
}
