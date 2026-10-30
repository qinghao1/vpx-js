// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { MathUtils } from 'three'
import type { ISoundEngine } from '../../audio/sound-engine.js'
import { warnOnce } from '../../emu/warn-once.js'
import { Event } from '../../game/event.js'
import { EventProxy } from '../../game/event-proxy.js'
import {
	type IAnimatable,
	type IHittable,
	type IMovable,
	type IPlayable,
	type IRenderable,
	type IScriptable,
	isAnimatable,
	isHittable,
	isMovable,
	isPlayable,
	isRenderable,
	isScriptable,
	type Meshes,
} from '../../game/interfaces.js'
import type { Player } from '../../game/player.js'
import type { IBinaryReader, Storage } from '../../io/ole-doc.js'
import { FRect3D } from '../../math/bounds.js'
import { Vertex3D } from '../../math/vector.js'
import type { HitObject } from '../../physics/hit-object.js'
import { HitPlane } from '../../physics/hit-plane.js'
import type { IRenderApi, MeshConvertOptions } from '../../render/irender-api.js'
import { Transpiler } from '../../scripting/transpiler.js'
import { toLowerCached } from '../../scripting/vbs-api.js'
import { logger, progress } from '../../util/logger.js'
import type { Bumper } from '../bumper/bumper.js'
import type { Collection } from '../collection/collection.js'
import type { Decal } from '../decal/decal.js'
import type { DispReel } from '../dispreel/dispreel.js'
import type { Flasher } from '../flasher/flasher.js'
import type { Flipper } from '../flipper/flipper.js'
import type { Gate } from '../gate/gate.js'
import type { HitTarget } from '../hit-target/hit-target.js'
import type { Item } from '../item.js'
import type { ItemApi } from '../item-api.js'
import { dequantizeSignedPercent } from '../item-api.js'
import type { ItemData } from '../item-data.js'
import { ITEM_REGISTRY } from '../item-registry.js'
import type { ItemState } from '../item-state.js'
import type { Kicker } from '../kicker/kicker.js'
import type { Light } from '../light/light.js'
import type { LightSeq } from '../lightseq/lightseq.js'
import type { Material } from '../material.js'
import type { Plunger } from '../plunger/plunger.js'
import type { Primitive } from '../primitive/primitive.js'
import type { Ramp } from '../ramp/ramp.js'
import type { Rubber } from '../rubber/rubber.js'
import type { Sound } from '../sound.js'
import type { Spinner } from '../spinner/spinner.js'
import type { Surface } from '../surface/surface.js'
import type { Textbox } from '../textbox/textbox.js'
import type { Texture } from '../texture.js'
import type { Timer } from '../timer/timer.js'
import type { Trigger } from '../trigger/trigger.js'
import { TableApi } from './table-api.js'
import type { TableData } from './table-data.js'
import { TableHitGenerator } from './table-hit-generator.js'
import { type LoadedTable, resolveLoadOptions, TableLoader } from './table-loader.js'
import { TableMeshGenerator } from './table-mesh-generator.js'
import { TableState } from './table-state.js'
import { TableUpdater } from './table-updater.js'

/** Visual Pinball table — holds all elements of a .vpx file.
 * @see https://github.com/vpinball/vpinball/blob/master/pintable.cpp */
export class Table implements IScriptable<TableApi>, IRenderable<TableState> {
	public readonly data?: TableData
	public readonly info?: { [key: string]: string }
	public readonly items: Record<string, Item<ItemData>>
	public readonly tableScript?: string
	private readonly state?: TableState
	private readonly updater?: TableUpdater
	private events?: EventProxy
	private api?: TableApi
	private readonly itemIndex = new Map<string, string>()
	// getTexture is per-frame hot (meshes + script setters); cache the case-insensitive lookup.
	private textureCache?: { map: Map<string, { key: string; texture: Texture }>; size: number }

	public readonly textures: Record<string, Texture> = {}
	public readonly sounds: Record<string, Sound> = {}
	public readonly collections: Record<string, Collection> = {}
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
	public readonly textboxes: Record<string, Textbox> = {}
	public readonly timers: Record<string, Timer> = {}
	public readonly triggers: Record<string, Trigger> = {}
	public readonly decals: Record<string, Decal> = {}
	public readonly lightSeqs: Record<string, LightSeq> = {}
	public readonly dispReels: Record<string, DispReel> = {}

	private readonly meshGenerator?: TableMeshGenerator
	private readonly hitGenerator?: TableHitGenerator

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
			this.hitGenerator = new TableHitGenerator(loaded.data)
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
		this.populateFromLoaded(
			loaded as unknown as Record<string, unknown>,
			'sounds',
			this.sounds as unknown as Record<string, unknown>,
		)
		this.populateFromLoaded(
			loaded as unknown as Record<string, unknown>,
			'collections',
			this.collections as unknown as Record<string, unknown>,
		)
		for (const [, entry] of Object.entries(ITEM_REGISTRY)) {
			this.populateFromLoaded(
				loaded as unknown as Record<string, unknown>,
				entry.key,
				(this as unknown as Record<string, unknown>)[entry.tableKey ?? entry.key] as Record<string, unknown>,
			)
		}
		for (const el of this.getScriptables()) {
			const name = el.getName()
			if (name !== undefined) this.itemIndex.set(name.toLowerCase(), name)
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
		const lc = name.toLowerCase()
		const size = Object.keys(this.textures).length
		if (!this.textureCache || this.textureCache.size !== size) this.rebuildTextureCache(size)
		const cached = this.textureCache.map.get(lc)
		if (cached && this.textures[cached.key] === cached.texture) return cached.texture
		// Stale hit or uncached miss: the dict may have been swapped at equal size, so rebuild once.
		this.rebuildTextureCache(size)
		return this.textureCache.map.get(lc)?.texture
	}
	private rebuildTextureCache(size: number): void {
		const map = new Map<string, { key: string; texture: Texture }>()
		for (const [key, texture] of Object.entries(this.textures)) {
			const entry = { key, texture }
			map.set(key.toLowerCase(), entry)
			const textureName = texture.getName?.()
			if (textureName) map.set(textureName.toLowerCase(), entry)
		}
		this.textureCache = { map, size }
	}
	public getMaterial(name?: string): Material | undefined {
		if (!name || !this.data) return undefined
		const mats = this.data.materials
		const lc = name.toLowerCase()
		for (let i = mats.length - 1; i >= 0; i--) {
			if (mats[i]!.name.toLowerCase() === lc) return mats[i]
		}
		return undefined
	}
	public getApi(): TableApi {
		return this.api!
	}
	public getState(): TableState {
		return this.state!
	}
	public getUpdater(): TableUpdater {
		return this.updater!
	}
	public getEventNames(): string[] {
		return ['Exit', 'Init', 'KeyDown', 'KeyUp', 'MusicDone', 'Paused', 'UnPaused', 'OptionEvent']
	}

	public setupPlayer(player: Player, _table: Table): void {
		this.events = new EventProxy(this)
		this.api = new TableApi(this.data!, this.events, player, this)
		this.registerTableSounds(player.getSoundEngine())
	}

	/** Case-insensitive, last wins (upstream resolves names through a case-insensitive map). */
	public getSound(name?: string): Sound | undefined {
		if (!name) return undefined
		const lc = name.toLowerCase()
		let found: Sound | undefined
		for (const [key, sound] of Object.entries(this.sounds)) {
			if (key.toLowerCase() === lc || sound.getName().toLowerCase() === lc) found = sound
		}
		return found
	}

	/** Registers every decoded table sound with the engine (re-run on engine swaps). */
	public registerTableSounds(engine: ISoundEngine): void {
		if (!engine) return
		// Route natural music ends to the script MusicDone event (native SoundPlayer::OnSoundEnd).
		engine.onMusicEnded = () => this.events?.fireVoidEvent(Event.GameEventsMusicDone)
		for (const [key, sound] of Object.entries(this.sounds)) {
			const name = sound.getName() || key
			if (sound.isPlayable())
				engine.registerSample(name, sound.pcm!, sound.sampleRate, {
					channels: sound.channels,
					volume: dequantizeSignedPercent(sound.volume),
					pan: dequantizeSignedPercent(sound.pan),
					frontRearFade: dequantizeSignedPercent(sound.frontRearFade),
				})
			else
				warnOnce(
					`table-sound:${name.toLowerCase()}`,
					'[Table] Sound "%s" has no decodable audio and will stay silent.',
					name,
				)
		}
	}

	public getBoundingBox(): FRect3D {
		return new FRect3D(
			this.data?.left,
			this.data?.right,
			this.data?.top,
			this.data?.bottom,
			0,
			this.data?.glassHeight,
		)
	}

	public getPlayables(): IPlayable[] {
		return [this, ...this.filterItems(isPlayable)]
	}
	public getMovables(): IMovable[] {
		return this.filterItems(isMovable)
	}
	public getRenderables(): Array<IRenderable<ItemState>> {
		return this.filterItems(isRenderable)
	}
	public getAnimatables(): IAnimatable[] {
		return this.filterItems(isAnimatable)
	}
	public getScriptables(): Array<IScriptable<ItemApi<ItemData>>> {
		return [this, ...this.filterItems(isScriptable)]
	}
	public getHittables(): IHittable[] {
		return this.filterItems(isHittable)
	}

	private filterItems<T>(guard: (x: unknown) => x is T): T[] {
		return this.getItems().filter(guard) as unknown as T[]
	}
	public getHitShapes(): HitObject[] {
		return this.hitGenerator?.generateHitObjects()
	}

	public generatePlayfieldHit(): HitPlane {
		return new HitPlane(new Vertex3D(0, 0, 1), 0)
			.setFriction(this.data?.getFriction())
			.setElasticity(this.data?.getElasticity(), this.data?.getElasticityFalloff())
			.setScatter(MathUtils.degToRad(this.data?.getScatter()))
	}
	public generateGlassHit(): HitPlane {
		const glassSlope = new Vertex3D(
			0,
			(this.data?.bottom ?? 0) - (this.data?.top ?? 0),
			(this.data?.glassBottomHeight ?? 0) - (this.data?.glassHeight ?? 0),
		)
		glassSlope.normalize()
		return new HitPlane(new Vertex3D(0, glassSlope.z, -glassSlope.y), -(this.data?.glassHeight ?? 0)).setElasticity(
			0.2,
		)
	}

	public getElementApis(): Record<string, ItemApi<ItemData>> {
		const apis: Record<string, ItemApi<ItemData>> = {}
		for (const el of this.getScriptables()) apis[el.getName()] = el.getApi()
		return apis
	}

	public getElementApiName(vbsName: string): string {
		return this.itemIndex.get(toLowerCached(vbsName))!
	}

	public getElements(): Record<string, IScriptable<ItemApi<ItemData>>> {
		const els: Record<string, IScriptable<ItemApi<ItemData>>> = {}
		for (const el of this.getScriptables()) els[el.getName()] = el
		return els
	}

	public getScaleZ(): number {
		if (!this.data) throw new Error('Table data not loaded')
		return this.data.bgScaleZ[this.data.bgCurrentSet]! || 1.0
	}
	public getDetailLevel(): number {
		return 10
	}
	public getGlobalDifficulty(): number {
		return this.data?.globalDifficulty ?? 0.2
	}
	/** Deprecated upstream; always 0. */
	public getTableHeight(): number {
		return 0
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

	public getTableScript(): string {
		if (!this.tableScript) throw new Error('Table script not loaded')
		return this.tableScript
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

	public tableNode?: unknown
	public renderApi?: IRenderApi<any, any, any>

	/** Generates top-most scene node containing the entire table. */
	public async generateTableNode<NODE, GEOMETRY, POINT_LIGHT>(
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		opts: TableExportOptions & { preloadTextures?: boolean } = {},
	): Promise<NODE> {
		this.renderApi = renderApi as unknown as IRenderApi<any, any, any>
		if (opts.preloadTextures !== false) {
			await renderApi.preloadTextures(Object.values(this.textures), this)
		}
		const node = (await this.meshGenerator?.generateTableNode(renderApi, opts)) as NODE
		this.tableNode = node
		return node
	}

	public prepareToPlay(): void {
		for (const p of Object.values<Primitive>(this.primitives)) p.clearMesh()
	}

	public runTableScript(player: Player, scope: Record<string, unknown> = {}): void {
		if (!this.tableScript) {
			logger().warn('Table script not loaded!')
			return
		}
		progress().show('Transpiling and executing table script')
		const started = Date.now()
		new Transpiler(this, player).execute(this.tableScript, scope)
		logger().info('Table script transpiled and executed in %sms.', Date.now() - started)
	}

	public async runTableScriptAsync(player: Player, scope: Record<string, unknown> = {}): Promise<void> {
		if (!this.tableScript) {
			logger().warn('Table script not loaded!')
			return
		}
		progress().show('Transpiling and executing table script')
		const started = Date.now()
		await new Transpiler(this, player).executeAsync(this.tableScript, scope)
		logger().info('Table script transpiled and executed in %sms.', Date.now() - started)
	}

	public broadcastInit(): void {
		this.events?.fireVoidEvent(Event.GameEventsInit)
		for (const item of Object.values(this.items)) {
			const proxy = (item as unknown as { getEventProxy?: () => EventProxy })?.getEventProxy?.()
			proxy?.fireVoidEvent(Event.GameEventsInit)
		}
	}
	public broadcastOptionEvent(eventType = 0): void {
		this.events?.fireVoidEventParm(Event.GameEventsOptionEvent, eventType)
	}
	public fireVoidEvent(event: Event): this {
		this.events?.fireVoidEvent(event)
		return this
	}

	public setupCollections(): void {
		for (const item of Object.values(this.items))
			if (isScriptable(item as unknown))
				(item as unknown as IScriptable<ItemApi<ItemData>>).getApi()._resetCollections()
		for (const col of Object.values(this.collections))
			for (const name of col.getItemNames()) {
				const item = this.getItemByName(name)
				if (!item) {
					logger().warn('Non-existent item "%s" in collection "%s", skipping.', name, col.getName())
					continue
				}
				if (isScriptable(item as unknown)) {
					;(item as unknown as IScriptable<ItemApi<ItemData>>).getApi()._addCollection(col, col.items.length)
					col.items.push((item as unknown as IScriptable<ItemApi<ItemData>>).getApi())
				}
			}
	}

	public getItems(): Array<Item<ItemData>> {
		return Object.values(this.items)
	}

	/** Case-insensitive item lookup — upstream compares names with `StrCompareNoCase`. */
	public getItemByName(name: string): Item<ItemData> | undefined {
		return findByName(this.items, name)
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
	/** Also parse invisible items (timers, etc.). */
	loadInvisibleItems?: boolean
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
	gltfOptions?: TableGenerateGltfOptions
}

export interface TableGenerateGltfOptions {
	binary?: boolean
	trs?: boolean
	onlyVisible?: boolean
	animations?: any[]
	maxTextureSize?: number
	includeCustomExtensions?: boolean
}

/** Mesh generation options (generateTableNode/getMeshes). */
export interface TableExportOptions extends TableGenerateOptions, MeshConvertOptions {}
