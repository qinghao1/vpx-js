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

// Round band edges, not measured knees — retune once dispatch is profiled.
const SMALL_TEXTURE_BYTES = 1 << 20
const GIANT_TEXTURE_BYTES = 16 << 20

function payloadBytes(texture: Texture): number {
	return texture.retainedData?.length ?? texture.binary?.len ?? texture.pdsBuffer?.getData()?.length ?? 0
}

function sizeBucket(bytes: number): number {
	return bytes < SMALL_TEXTURE_BYTES ? 0 : bytes > GIANT_TEXTURE_BYTES ? 2 : 1
}

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
		// Overlap HDR worker spawn with PNG parsing: the node loader spawns
		// its decode pool lazily, so kick it before dispatch. Gated on
		// non-raw float textures — raw floats decode in memory via
		// loadRawTexture and never touch the pool — so HDR-free and raw-only
		// tables skip the spawn entirely.
		if (textures.some(tex => tex.isHdr() && !tex.isRaw())) {
			this.textureLoader.warmup?.()
		}
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
		// Small-first, giants-last: giant playfield bakes at the head occupied
		// every worker (~20s stall) while small completions starved. Pure size
		// order would instead starve first paint, so the first playfield bake
		// stays pinned at slot 0 (one worker) and everything else dispatches
		// by size band, playfield-first within each band, caller order beyond
		// that. Unknown-size (filesystem/default) textures sort as small.
		const isPlayfield = textures.map(tex => isPlayfieldCap(tex.getName()))
		const bucket = textures.map(tex => sizeBucket(payloadBytes(tex)))
		const firstPlayfield = isPlayfield.indexOf(true)
		const order = textures
			.map((_, i) => i)
			.sort(
				(a, b) =>
					(a === firstPlayfield ? -1 : b === firstPlayfield ? 1 : 0) ||
					bucket[a]! - bucket[b]! ||
					Number(!isPlayfield[a]) - Number(!isPlayfield[b]) ||
					a - b,
			)
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
		if (this.isCoolingDown(texture.getName())) {
			return Promise.resolve(false)
		}
		const attempt = this.loadOne(texture, table).finally(() => {
			if (this.inFlight.get(key) === attempt) this.inFlight.delete(key)
		})
		this.inFlight.set(key, attempt)
		return attempt
	}

	/**
	 * True while a failed texture still sits out its retry cooldown
	 * (LOAD_FAILURE_COOLDOWN_MS). The name is lowercased before lookup,
	 * matching the keys stored in lastFailureAt. Both loadShared and
	 * demandPendingMaps consult this so a cooling-down texture reports
	 * missing without starting a new load.
	 */
	private isCoolingDown(name: string): boolean {
		return Date.now() - (this.lastFailureAt.get(name.toLowerCase()) ?? 0) < LOAD_FAILURE_COOLDOWN_MS
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
		const failed: string[] = []
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
				// Unreadable now means unloadable later; record it so the later
				// demand failure isn't mistaken for a released archive.
				failed.push(texture.getName())
			}
		}
		if (failed.length)
			logger().debug(
				'[ThreeMapGenerator.loadTextures] Could not retain %s texture sources (%s); their demand loads fail once the archive is released.',
				failed.length,
				failed.join(', '),
			)
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
			// A cached texture never consults the cooldown, so drop its
			// stamp instead of growing one map entry per failed name.
			this.lastFailureAt.delete(texture.getName().toLowerCase())
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
	 * Textures inside the failure cooldown also report missing here and are
	 * retried on a later pass.
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
				// Cooling-down retries report missing here, exactly as loadShared would
				// (false, no new attempt); re-queueing them only repeats the loadTextures
				// Pre-loading/Loaded summary lines on every demand pass.
				if (this.isCoolingDown(fromTable.getName())) {
					missing.push(fromTable.getName())
					continue
				}
				loadable.push(fromTable)
				continue
			}
			// Engine defaults (bumper/kicker/…) live in res/maps, not the table —
			// but only attempt names the loader actually ships, so deleted table
			// textures (glass*) report missing once instead of failing every cycle.
			const loader = this.textureLoader as unknown as {
				hasDefaultTexture?: (name: string) => boolean
			}
			if (loader?.hasDefaultTexture?.(name) ?? true) {
				const fallback = Texture.fromFilesystem(name)
				// Same quiet-skip as the table branch above: a cooling-down
				// engine default reports missing without re-logging the
				// loadTextures summaries every demand pass.
				if (this.isCoolingDown(fallback.getName())) {
					missing.push(fallback.getName())
					continue
				}
				loadable.push(fallback)
			} else missing.push(name)
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
