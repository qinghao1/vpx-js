// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Event } from '../../game/event.js'
import { EventProxy } from '../../game/event-proxy.js'
import { type IAnimatable, isAnimatable } from '../../game/ianimatable.js'
import { type IHittable, isHittable } from '../../game/ihittable.js'
import { type IMovable, isMovable } from '../../game/imovable.js'
import { type IPlayable, isPlayable } from '../../game/iplayable.js'
import { type IRenderable, isRenderable, type Meshes } from '../../game/irenderable.js'
import { type IScriptable, isScriptable } from '../../game/iscriptable.js'
import type { Player } from '../../game/player.js'
import type { IBinaryReader, Storage } from '../../io/ole-doc.js'
import { degToRad, f4 } from '../../math/float.js'
import { FRect3D } from '../../math/frect3d.js'
import { Vertex3D } from '../../math/vertex3d.js'
import type { HitObject } from '../../physics/hit-object.js'
import { HitPlane } from '../../physics/hit-plane.js'
import type { IRenderApi } from '../../render/irender-api.js'
import { Transpiler } from '../../scripting/transpiler.js'
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
import type { Spinner } from '../spinner/spinner.js'
import type { Surface } from '../surface/surface.js'
import type { Textbox } from '../textbox/textbox.js'
import type { Texture } from '../texture.js'
import type { Timer } from '../timer/timer.js'
import type { Trigger } from '../trigger/trigger.js'
import { TableApi } from './table-api.js'
import type { TableData } from './table-data.js'
import type { TableExportOptions } from './table-exporter.js'
import { TableHitGenerator } from './table-hit-generator.js'
import { type LoadedTable, TableLoader } from './table-loader.js'
import { TableMeshGenerator } from './table-mesh-generator.js'
import { TableState } from './table-state.js'
import { TableUpdater } from './table-updater.js'

/**
 * A Visual Pinball table.
 *
 * This holds together all table elements of a .vpt/.vpx file. It's also
 * the entry point for parsing the file.
 */
export class Table implements IScriptable<TableApi>, IRenderable<TableState> {
	public readonly data?: TableData
	public readonly info?: { [key: string]: string }
	public readonly items: { [key: string]: Item<ItemData> }
	public readonly tableScript?: string
	private readonly state?: TableState
	private readonly updater?: TableUpdater
	private events?: EventProxy
	private api?: TableApi
	private itemIndex?: { [key: string]: string }

	public readonly textures: { [key: string]: Texture } = {}
	public readonly collections: { [key: string]: Collection } = {}

	public readonly bumpers: { [key: string]: Bumper } = {}
	public readonly flippers: { [key: string]: Flipper } = {}
	public readonly flashers: { [key: string]: Flasher } = {}
	public readonly gates: { [key: string]: Gate } = {}
	public readonly hitTargets: { [key: string]: HitTarget } = {}
	public readonly kickers: { [key: string]: Kicker } = {}
	public readonly lights: { [key: string]: Light } = {}
	public readonly plungers: { [key: string]: Plunger } = {}
	public readonly primitives: { [key: string]: Primitive } = {}
	public readonly ramps: { [key: string]: Ramp } = {}
	public readonly rubbers: { [key: string]: Rubber } = {}
	public readonly spinners: { [key: string]: Spinner } = {}
	public readonly surfaces: { [key: string]: Surface } = {}
	public readonly textboxes: { [key: string]: Textbox } = {}
	public readonly timers: { [key: string]: Timer } = {}
	public readonly triggers: { [key: string]: Trigger } = {}
	public readonly decals: { [key: string]: Decal } = {}
	public readonly lightSeqs: { [key: string]: LightSeq } = {}
	public readonly dispReels: { [key: string]: DispReel } = {}

	private readonly meshGenerator?: TableMeshGenerator
	private readonly hitGenerator?: TableHitGenerator

	private readonly loader: TableLoader

	public static playfieldThickness = 20.0

	public static async load(reader: IBinaryReader, opts?: TableLoadOptions): Promise<Table> {
		opts = opts || defaultTableLoadOptions
		const tableLoader = new TableLoader()
		return new Table(tableLoader, await tableLoader.load(reader, opts))
	}

	public constructor(loader: TableLoader, loadedTable: LoadedTable) {
		this.loader = loader
		this.items = loadedTable.items
		if (loadedTable.data) {
			this.data = loadedTable.data
			this.meshGenerator = new TableMeshGenerator(this)
			this.hitGenerator = new TableHitGenerator(loadedTable.data)
			this.state = TableState.claim(this.data.getName(), this.data.szPlayfieldMaterial, true)
			this.updater = new TableUpdater(this.state)
		}
		if (loadedTable.info) {
			this.info = loadedTable.info
		}
		if (loadedTable.tableScript) {
			this.tableScript = loadedTable.tableScript
		}
		// Populate item dictionaries via registry to avoid manual mapping boilerplate
		this.populateFromLoaded(loadedTable, 'textures', this.textures)
		this.populateFromLoaded(loadedTable, 'collections', this.collections)
		for (const [itemType, entry] of Object.entries(ITEM_REGISTRY)) {
			const loadedKey = entry.key as keyof typeof loadedTable
			// Table property for textBoxes is camelCase textboxes
			const tableKey = loadedKey === 'textBoxes' ? 'textboxes' : loadedKey
			this.populateFromLoaded(loadedTable, loadedKey as any, (this as any)[tableKey])
		}
	}

	private populateFromLoaded(loadedTable: any, key: string, dict: Record<string, any>): void {
		const items = loadedTable[key] as any[] | undefined
		if (!items?.length) return
		for (const item of items) dict[item.getName()] = item
	}

	public getName(): string {
		return this.data!.getName()
	}

	public getTexture(name?: string): Texture | undefined {
		if (!name) {
			return undefined
		}
		return this.textures[name.toLowerCase()]
	}

	public getMaterial(name?: string): Material | undefined {
		if (!name) {
			return undefined
		}
		/* istanbul ignore if */
		if (!this.data) {
			throw new Error('Table data is not loaded. Load table with tableDataOnly = false.')
		}
		const exact = this.data.materials.find((m) => m.name === name)
		if (exact) return exact
		const lower = name.toLowerCase()
		const byLower = this.data.materials.find((m) => m.name.toLowerCase() === lower)
		if (byLower) return byLower
		const withUnderscore = this.data.materials.find((m) => m.name.toLowerCase() === '_' + lower)
		if (withUnderscore) return withUnderscore
		const withoutUnderscore = lower.startsWith('_')
			? this.data.materials.find((m) => m.name.toLowerCase() === lower.slice(1))
			: undefined
		if (withoutUnderscore) return withoutUnderscore
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
		return ['Exit', 'Init', 'KeyDown', 'KeyUp', 'MusicDone', 'Paused', 'UnPaused']
	}

	public setupPlayer(player: Player, table: Table): void {
		this.events = new EventProxy(this)
		this.api = new TableApi(this.data!, this.events, player, this)
	}

	public getBoundingBox(): FRect3D {
		return new FRect3D(
			this.data!.left,
			this.data!.right,
			this.data!.top,
			this.data!.bottom,
			this.getTableHeight(),
			this.data!.glassHeight,
		)
	}

	public getPlayables(): IPlayable[] {
		const playableItems = this.getItems().filter(isPlayable) as unknown as IPlayable[]
		return [this, ...playableItems]
	}

	public getMovables(): IMovable[] {
		return this.getItems().filter(isMovable) as unknown as IMovable[]
	}

	public getRenderables(): Array<IRenderable<ItemState>> {
		return this.getItems().filter(isRenderable) as unknown as Array<IRenderable<ItemState>>
	}

	public getAnimatables(): IAnimatable[] {
		return this.getItems().filter(isAnimatable) as unknown as IAnimatable[]
	}

	public getScriptables(): Array<IScriptable<any>> {
		const scriptableItems = this.getItems().filter(isScriptable) as unknown as Array<IScriptable<any>>
		return [this, ...scriptableItems]
	}

	public getHittables(): IHittable[] {
		return this.getItems().filter(isHittable) as unknown as IHittable[]
	}

	public getHitShapes(): HitObject[] {
		return this.hitGenerator!.generateHitObjects()
	}

	public generatePlayfieldHit() {
		return new HitPlane(new Vertex3D(0, 0, 1), this.data!.tableHeight)
			.setFriction(this.data!.getFriction())
			.setElasticity(this.data!.getElasticity(), this.data!.getElasticityFalloff())
			.setScatter(degToRad(this.data!.getScatter()))
	}

	public generateGlassHit() {
		return new HitPlane(new Vertex3D(0, 0, -1), this.data!.glassHeight).setElasticity(0.2)
	}

	public getElementApis(): { [key: string]: any } {
		const apis: { [key: string]: any } = {}
		const elements = this.getScriptables()
		for (const element of elements) {
			apis[element.getName()] = element.getApi()
		}
		return apis
	}

	public getElementApiName(vbsName: string): string {
		if (!this.itemIndex) {
			this.itemIndex = {}
			for (const element of this.getScriptables()) {
				this.itemIndex[element.getName().toLowerCase()] = element.getName()
			}
		}
		return this.itemIndex[vbsName.toLowerCase()]
	}

	public getElements(): { [key: string]: IScriptable<any> } {
		const elements: { [key: string]: any } = {}
		const elementList = this.getScriptables()
		for (const element of elementList) {
			elements[element.getName()] = element
		}
		return elements
	}

	public getScaleZ(): number {
		/* istanbul ignore if */
		if (!this.data) {
			throw new Error('Table data is not loaded. Load table with tableDataOnly = false.')
		}
		return f4(this.data.bgScaleZ[this.data.bgCurrentSet]) || 1.0
	}

	public getDetailLevel() {
		return 10 // todo check if true
	}

	public getGlobalDifficulty(): number {
		return this.data!.globalDifficulty!
	}

	public getTableHeight() {
		/* istanbul ignore if */
		if (!this.data) {
			throw new Error('Table data is not loaded. Load table with tableDataOnly = false.')
		}
		return this.data.tableHeight
	}

	public getDimensions(): { width: number; height: number } {
		/* istanbul ignore if */
		if (!this.data) {
			throw new Error('Table data is not loaded. Load table with tableDataOnly = false.')
		}
		return {
			width: this.data.right - this.data.left,
			height: this.data.bottom - this.data.top,
		}
	}

	public getPlayfieldMap(): string {
		/* istanbul ignore if */
		if (!this.data) {
			throw new Error('Table data is not loaded. Load table with tableDataOnly = false.')
		}
		return this.data.szImage || ''
	}

	public getSurfaceHeight(surface: string | undefined, x: number, y: number) {
		/* istanbul ignore if */
		if (!this.data) {
			throw new Error('Table data is not loaded. Load table with tableDataOnly = false.')
		}
		if (!surface) {
			return this.data.tableHeight
		}

		if (this.surfaces[surface]) {
			return f4(this.data.tableHeight + this.surfaces[surface].heightTop)
		}

		if (this.ramps[surface]) {
			return f4(this.data.tableHeight + this.ramps[surface].getSurfaceHeight(x, y, this))
		}

		/* istanbul ignore next */
		logger().warn('[Table.getSurfaceHeight] Unknown surface %s.', surface)
		return this.data.tableHeight
	}

	// public async exportGltf(opts?: TableExportOptions): Promise<string> {
	// 	const exporter = new TableExporter(this, opts || {});
	// 	return await exporter.exportGltf();
	// }

	// public async exportGlb(opts?: TableExportOptions): Promise<Buffer> {
	// 	const exporter = new TableExporter(new ThreeRenderApi(), this, opts || {});
	// 	return await exporter.exportGlb();
	// }

	public async streamStorage<T>(name: string, streamer: (stg: Storage) => Promise<T>): Promise<T> {
		return this.loader.streamStorage(name, streamer)
	}

	public getTableScript(): string {
		/* istanbul ignore if */
		if (!this.tableScript) {
			throw new Error('Table script is not loaded. Load table with loadTableScript = true.')
		}
		return this.tableScript
	}

	public isVisible(): boolean {
		return true
	}

	public getMeshes<NODE, GEOMETRY, POINT_LIGHT>(
		table: Table,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		opts: TableExportOptions,
	): Meshes<GEOMETRY> {
		/* istanbul ignore if */
		if (!this.data) {
			throw new Error('Table data is not loaded. Load table with tableDataOnly = false.')
		}
		const geometry = this.meshGenerator!.getPlayfieldMesh(renderApi, opts)
		return {
			playfield: {
				isVisible: true,
				geometry,
				material: this.getMaterial(this.data.szPlayfieldMaterial),
				map: this.getTexture(this.data.szImage),
			},
		}
	}

	/**
	 * Generates the top-most node for the render engine that contains the entire table.
	 *
	 * @param renderApi Render API
	 * @param opts Which elements to generate
	 */
	public async generateTableNode<NODE, GEOMETRY, POINT_LIGHT>(
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		opts: TableExportOptions = {},
	): Promise<NODE> {
		await renderApi.preloadTextures(Object.values(this.textures), this)
		return this.meshGenerator!.generateTableNode(renderApi, opts)
	}

	public prepareToPlay() {
		for (const primitive of Object.values<Primitive>(this.primitives)) {
			primitive.clearMesh()
		}
	}

	public runTableScript(player: Player, scope = {}): void {
		if (!this.tableScript) {
			logger().warn('Table script is not loaded!')
			return
		}
		progress().show('Transpiling and executing table script')
		const transpiler = new Transpiler(this, player)
		transpiler.execute(this.tableScript, scope)
		logger().info('Table script loaded, transpiled and executed.')
	}

	public broadcastInit() {
		this.events!.fireVoidEvent(Event.GameEventsInit)
		for (const hittable of this.getHittables()) {
			hittable.getEventProxy().fireVoidEvent(Event.GameEventsInit)
		}
	}

	public fireVoidEvent(event: Event): this {
		this.events!.fireVoidEvent(event)
		return this
	}

	public setupCollections() {
		for (const tableItem of Object.keys(this.items)) {
			if (isScriptable(tableItem)) {
				tableItem.getApi()._resetCollections()
			}
		}
		for (const collection of Object.values(this.collections)) {
			for (const itemName of collection.getItemNames()) {
				const tableItem = this.items[itemName]
				if (!tableItem) {
					logger().warn('Non-existent item "%s" in collection "%s", skipping.', itemName, collection.getName())
					break
				}
				if (isScriptable(tableItem)) {
					tableItem.getApi()._addCollection(collection, collection.items.length)
					collection.items.push(tableItem.getApi())
				}
			}
		}
	}

	public getItems(): Array<Item<ItemData>> {
		return Object.values(this.items)
	}
}

function isLoaded(items: any[] | undefined) {
	return items && items.length > 0
}

const defaultTableLoadOptions: TableLoadOptions = {
	tableDataOnly: false,
	tableInfoOnly: false,
	loadInvisibleItems: true,
	loadTableScript: true,
}

export interface TableLoadOptions {
	/**
	 * If set, don't parse game items but only game data (faster).
	 */
	tableDataOnly?: boolean

	/**
	 * If set, ignore game storage and only parse table info.
	 */
	tableInfoOnly?: boolean

	/**
	 * If set, also parse items like timers, i.e. non-visible items.
	 */
	loadInvisibleItems?: boolean

	/**
	 * If set, table script is read
	 */
	loadTableScript?: boolean

	/**
	 * If set, skips reading primitive mesh data.
	 */
	skipMeshes?: boolean
}

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
	optimizeImages?: boolean
	trs?: boolean
	onlyVisible?: boolean
	truncateDrawRange?: boolean
	embedImages?: boolean
	animations?: any[]
	forceIndices?: boolean
	forcePowerOfTwoTextures?: boolean
	compressVertices?: boolean
	versionString?: string
	dracoOptions?: {
		compressionLevel?: number
		quantizePosition?: number
		quantizeNormal?: number
		quantizeTexcoord?: number
		quantizeColor?: number
		quantizeSkin?: number
		unifiedQuantization?: boolean
	}
}
