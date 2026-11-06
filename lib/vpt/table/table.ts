// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { IBinaryReader, Storage } from '../../io/ole-doc.js'
import type { IRenderApi, IRenderable, MeshConvertOptions, Meshes } from '../../render/irender-api.js'
import { logger } from '../../util/logger.js'
import type { Bumper } from '../bumper/bumper.js'
import type { Decal } from '../decal/decal.js'
import type { Flasher } from '../flasher/flasher.js'
import type { Flipper } from '../flipper/flipper.js'
import type { Gate } from '../gate/gate.js'
import type { HitTarget } from '../hit-target/hit-target.js'
import type { Item } from '../item.js'
import type { ItemData } from '../item-data.js'
import { ITEM_REGISTRY } from '../item-registry.js'
import type { Kicker } from '../kicker/kicker.js'
import type { Light } from '../light/light.js'
import type { Material } from '../material.js'
import type { Plunger } from '../plunger/plunger.js'
import type { Primitive } from '../primitive/primitive.js'
import type { Ramp } from '../ramp/ramp.js'
import type { Rubber } from '../rubber/rubber.js'
import type { Spinner } from '../spinner/spinner.js'
import type { Surface } from '../surface/surface.js'
import type { Texture } from '../texture.js'
import type { Trigger } from '../trigger/trigger.js'
import type { TableData } from './table-data.js'
import { type LoadedTable, resolveLoadOptions, TableLoader } from './table-loader.js'
import { TableMeshGenerator } from './table-mesh-generator.js'
import { TableState } from './table-state.js'
import { TableUpdater } from './table-updater.js'

/** Visual Pinball table — holds all elements of a .vpx file.
 * @see https://github.com/vpinball/vpinball/blob/master/pintable.cpp */
export class Table implements IRenderable<TableState> {
	public readonly data?: TableData
	public readonly info?: { [key: string]: string }
	public readonly items: Record<string, Item<ItemData>>
	public readonly tableScript?: string
	private readonly state?: TableState
	private readonly updater?: TableUpdater
	// getTexture is per-frame hot (meshes + script setters); cache the case-insensitive lookup.
	private textureCache?: {
		map: Map<string, { key: string; texture: Texture }>
		size: number
		source: Record<string, Texture>
	}
	private materialCache?: { map: Map<string, Material>; materials: Material[]; length: number }

	public readonly textures: Record<string, Texture> = {}
	public readonly bumpers: Record<string, Bumper> = {}
	public readonly flippers: Record<string, Flipper> = {}
	public readonly flashers: Record<string, Flasher> = {}
	public readonly gates: Record<string, Gate> = {}
	public readonly hitTargets: Record<string, HitTarget> = {}
	public readonly kickers: Record<string, Kicker> = {}
	public readonly lights: Record<string, Light> = {}
	public readonly plungers: Record<string, Plunger> = {}
	public readonly primitives: Record<string, Primitive> = {}
	public readonly ramps: Record<string, Ramp> = {}
	public readonly rubbers: Record<string, Rubber> = {}
	public readonly spinners: Record<string, Spinner> = {}
	public readonly surfaces: Record<string, Surface> = {}
	public readonly triggers: Record<string, Trigger> = {}
	public readonly decals: Record<string, Decal> = {}

	private readonly meshGenerator?: TableMeshGenerator

	public static playfieldThickness = 20.0

	public static async load(reader: IBinaryReader, opts: TableLoadOptions = {}): Promise<Table> {
		const merged = resolveLoadOptions(opts)
		const l = new TableLoader()
		return new Table(l, await l.load(reader, merged))
	}

	constructor(
		private readonly loader: TableLoader,
		loaded: LoadedTable,
	) {
		this.items = loaded.items
		if (loaded.data) {
			this.data = loaded.data
			this.meshGenerator = new TableMeshGenerator(this)
			this.state = new TableState()
			this.state.name = this.data.getName()
			this.state.material = this.data.szPlayfieldMaterial
			this.updater = new TableUpdater(this.state)
		}
		if (loaded.info) this.info = loaded.info
		if (loaded.tableScript) this.tableScript = loaded.tableScript
		this.populateFromLoaded(
			loaded as unknown as Record<string, unknown>,
			'textures',
			this.textures as unknown as Record<string, unknown>,
		)
		for (const [, entry] of Object.entries(ITEM_REGISTRY)) {
			this.populateFromLoaded(
				loaded as unknown as Record<string, unknown>,
				entry.key,
				(this as unknown as Record<string, unknown>)[entry.key] as Record<string, unknown>,
			)
		}
	}

	private populateFromLoaded(loaded: Record<string, unknown>, key: string, dict: Record<string, unknown>): void {
		const items = loaded[key] as unknown as { getName(): string }[] | undefined
		if (!items?.length) return
		for (const it of items) dict[it.getName()] = it
	}

	public getName(): string {
		return this.data?.getName()
	}
	/** Case-insensitive, last wins (upstream resolves names through a case-insensitive map during playback). */
	public getTexture(name?: string): Texture | undefined {
		if (!name) return undefined
		if (!this.textureCache || this.textureCache.source !== this.textures) {
			this.rebuildTextureCache()
		}
		const lc = name.toLowerCase()
		const cached = this.textureCache.map.get(lc)
		if (cached && this.textures[cached.key] === cached.texture) return cached.texture
		// Stale hit or uncached miss: the dict may have grown or been swapped, so rebuild once.
		this.rebuildTextureCache()
		return this.textureCache.map.get(lc)?.texture
	}
	private rebuildTextureCache(): void {
		const map = new Map<string, { key: string; texture: Texture }>()
		for (const [key, texture] of Object.entries(this.textures)) {
			const entry = { key, texture }
			map.set(key.toLowerCase(), entry)
			const textureName = texture.getName?.()
			if (textureName) map.set(textureName.toLowerCase(), entry)
		}
		this.textureCache = { map, size: map.size, source: this.textures }
	}
	public getMaterial(name?: string): Material | undefined {
		if (!name || !this.data) return undefined
		const mats = this.data.materials
		if (!this.materialCache || this.materialCache.materials !== mats || this.materialCache.length !== mats.length) {
			const map = new Map<string, Material>()
			for (const mat of mats) map.set(mat.name.toLowerCase(), mat)
			this.materialCache = { map, materials: mats, length: mats.length }
		}
		return this.materialCache.map.get(name.toLowerCase())
	}
	public getState(): TableState {
		return this.state!
	}
	public getUpdater(): TableUpdater {
		return this.updater!
	}

	public getScaleZ(): number {
		if (!this.data) throw new Error('Table data not loaded')
		return this.data.bgScaleZ[this.data.bgCurrentSet]! || 1.0
	}
	public getDetailLevel(): number {
		return 10
	}

	public getDimensions(): { width: number; height: number } {
		if (!this.data) throw new Error('Table data not loaded')
		return { width: this.data.right - this.data.left, height: this.data.bottom - this.data.top }
	}

	public getPlayfieldMap(): string {
		if (!this.data) throw new Error('Table data not loaded')
		return this.data.szImage || ''
	}

	public getSurfaceHeight(surface: string | undefined, x: number, y: number): number {
		if (!this.data) throw new Error('Table data not loaded')
		if (!surface) return 0
		const surf = findByName(this.surfaces, surface)
		if (surf) return surf.heightTop
		const ramp = findByName(this.ramps, surface)
		if (ramp) return ramp.getSurfaceHeight(x, y, this)
		logger().warn('[Table.getSurfaceHeight] Unknown surface %s.', surface)
		return 0
	}

	public async streamStorage<T>(name: string, streamer: (stg: Storage) => Promise<T>): Promise<T> {
		return this.loader.streamStorage(name, streamer)
	}

	public isVisible(): boolean {
		return true
	}

	public getMeshes<NODE, GEOMETRY, POINT_LIGHT>(
		_table: Table,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		opts: TableExportOptions,
	): Meshes<GEOMETRY> {
		if (!this.data) throw new Error('Table data not loaded')
		return {
			playfield: {
				isVisible: true,
				geometry: this.meshGenerator?.getPlayfieldMesh(renderApi, opts),
				material: this.getMaterial(this.data.szPlayfieldMaterial),
				map: this.getTexture(this.data.szImage),
			},
		}
	}

	/** Generates top-most scene node containing the entire table. */
	public async generateTableNode<NODE, GEOMETRY, POINT_LIGHT>(
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		opts: TableExportOptions & { preloadTextures?: boolean } = {},
	): Promise<NODE> {
		if (opts.preloadTextures !== false) {
			await renderApi.preloadTextures(Object.values(this.textures), this)
		}
		return (await this.meshGenerator?.generateTableNode(renderApi, opts)) as NODE
	}
}

/** Exact match first, then case-insensitive fallback (dict keys are exact names). */
function findByName<Entry extends { getName(): string }>(dict: Record<string, Entry>, name: string): Entry | undefined {
	const exact = dict[name]
	if (exact) return exact
	const lowered = name.toLowerCase()
	return Object.values(dict).find(entry => entry.getName().toLowerCase() === lowered)
}

/** Options for loading a table. */
export interface TableLoadOptions {
	/** Only parse game data, skip items (faster). */
	tableDataOnly?: boolean
	/** Only parse table info, skip storage (authoritative: suppresses the loadTableScript default unless explicitly set). */
	tableInfoOnly?: boolean
	/** Read table script (default true; forced off by tableInfoOnly unless explicitly set). */
	loadTableScript?: boolean
	/** Skip primitive mesh data. */
	skipMeshes?: boolean
	/** Skip texture images (faster, for play without textures). */
	skipTextures?: boolean
}

/** Mesh generation options. */
export interface TableGenerateOptions {
	exportPlayfield?: boolean
	exportPrimitives?: boolean
	exportRubbers?: boolean
	exportSurfaces?: boolean
	exportFlashers?: boolean
	exportFlippers?: boolean
	exportBumpers?: boolean
	exportRamps?: boolean
	exportLightBulbs?: boolean
	exportPlayfieldLights?: boolean
	exportLightBulbLights?: boolean
	exportHitTargets?: boolean
	exportGates?: boolean
	exportKickers?: boolean
	exportTriggers?: boolean
	exportSpinners?: boolean
	exportPlungers?: boolean
}

/** Mesh generation options (generateTableNode/getMeshes). */
export interface TableExportOptions extends TableGenerateOptions, MeshConvertOptions {}
