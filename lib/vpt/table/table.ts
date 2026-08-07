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

/** Visual Pinball table — holds all elements of a .vpx file.
 * @see https://github.com/vpinball/vpinball/blob/master/pintable.cpp */
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

	public static async load(reader: IBinaryReader, opts: TableLoadOptions = defaultTableLoadOptions): Promise<Table> {
		const l = new TableLoader()
		return new Table(l, await l.load(reader, opts))
	}

	public constructor(loader: TableLoader, loaded: LoadedTable) {
		this.loader = loader
		this.items = loaded.items
		if (loaded.data) {
			this.data = loaded.data
			this.meshGenerator = new TableMeshGenerator(this)
			this.hitGenerator = new TableHitGenerator(loaded.data)
			this.state = TableState.claim(this.data.getName(), this.data.szPlayfieldMaterial, true)
			this.updater = new TableUpdater(this.state)
		}
		if (loaded.info) this.info = loaded.info
		if (loaded.tableScript) this.tableScript = loaded.tableScript
		this.populateFromLoaded(loaded, 'textures', this.textures)
		this.populateFromLoaded(loaded, 'collections', this.collections)
		for (const [type, entry] of Object.entries(ITEM_REGISTRY)) {
			const loadedKey = entry.key as keyof typeof loaded
			const tableKey = loadedKey === 'textBoxes' ? 'textboxes' : loadedKey
			this.populateFromLoaded(loaded, loadedKey as any, (this as any)[tableKey])
		}
	}

	private populateFromLoaded(loaded: any, key: string, dict: Record<string, any>): void {
		const items = loaded[key] as any[] | undefined
		if (!items?.length) return
		for (const it of items) dict[it.getName()] = it
	}

	public getName(): string {
		return this.data!.getName()
	}
	public getTexture(name?: string): Texture | undefined {
		return name ? this.textures[name.toLowerCase()] : undefined
	}
	public getMaterial(name?: string): Material | undefined {
		if (!name) return undefined
		if (!this.data) throw new Error('Table data not loaded')
		const mats = this.data.materials
		const lc = name.toLowerCase()
		return (
			mats.find((m) => m.name === name) ??
			mats.find((m) => m.name.toLowerCase() === lc) ??
			mats.find((m) => m.name.toLowerCase() === `_${lc}`) ??
			(name.startsWith('_') ? mats.find((m) => m.name.toLowerCase() === lc.slice(1)) : undefined)
		)
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
		return [this, ...(this.getItems().filter(isPlayable) as unknown as IPlayable[])]
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
		return [this, ...(this.getItems().filter(isScriptable) as unknown as Array<IScriptable<any>>)]
	}
	public getHittables(): IHittable[] {
		return this.getItems().filter(isHittable) as unknown as IHittable[]
	}
	public getHitShapes(): HitObject[] {
		return this.hitGenerator!.generateHitObjects()
	}

	public generatePlayfieldHit(): HitPlane {
		return new HitPlane(new Vertex3D(0, 0, 1), this.data!.tableHeight)
			.setFriction(this.data!.getFriction())
			.setElasticity(this.data!.getElasticity(), this.data!.getElasticityFalloff())
			.setScatter(degToRad(this.data!.getScatter()))
	}
	public generateGlassHit(): HitPlane {
		return new HitPlane(new Vertex3D(0, 0, -1), this.data!.glassHeight).setElasticity(0.2)
	}

	public getElementApis(): { [key: string]: any } {
		const apis: { [key: string]: any } = {}
		for (const el of this.getScriptables()) apis[el.getName()] = el.getApi()
		return apis
	}

	public getElementApiName(vbsName: string): string {
		if (!this.itemIndex) {
			this.itemIndex = {}
			for (const el of this.getScriptables()) this.itemIndex[el.getName().toLowerCase()] = el.getName()
		}
		return this.itemIndex[vbsName.toLowerCase()]
	}

	public getElements(): { [key: string]: IScriptable<any> } {
		const els: { [key: string]: any } = {}
		for (const el of this.getScriptables()) els[el.getName()] = el
		return els
	}

	public getScaleZ(): number {
		if (!this.data) throw new Error('Table data not loaded')
		return f4(this.data.bgScaleZ[this.data.bgCurrentSet]) || 1.0
	}
	public getDetailLevel(): number {
		return 10
	}
	public getGlobalDifficulty(): number {
		return this.data!.globalDifficulty!
	}
	public getTableHeight(): number {
		if (!this.data) throw new Error('Table data not loaded')
		return this.data.tableHeight
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
		if (!surface) return this.data.tableHeight
		if (this.surfaces[surface]) return f4(this.data.tableHeight + this.surfaces[surface].heightTop)
		if (this.ramps[surface]) return f4(this.data.tableHeight + this.ramps[surface].getSurfaceHeight(x, y, this))
		logger().warn('[Table.getSurfaceHeight] Unknown surface %s.', surface)
		return this.data.tableHeight
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
		table: Table,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		opts: TableExportOptions,
	): Meshes<GEOMETRY> {
		if (!this.data) throw new Error('Table data not loaded')
		return {
			playfield: {
				isVisible: true,
				geometry: this.meshGenerator!.getPlayfieldMesh(renderApi, opts),
				material: this.getMaterial(this.data.szPlayfieldMaterial),
				map: this.getTexture(this.data.szImage),
			},
		}
	}

	/** Generates top-most scene node containing the entire table. */
	public async generateTableNode<NODE, GEOMETRY, POINT_LIGHT>(
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		opts: TableExportOptions = {},
	): Promise<NODE> {
		await renderApi.preloadTextures(Object.values(this.textures), this)
		return this.meshGenerator!.generateTableNode(renderApi, opts)
	}

	public prepareToPlay(): void {
		for (const p of Object.values<Primitive>(this.primitives)) p.clearMesh()
	}

	public runTableScript(player: Player, scope: any = {}): void {
		if (!this.tableScript) {
			logger().warn('Table script not loaded!')
			return
		}
		progress().show('Transpiling and executing table script')
		new Transpiler(this, player).execute(this.tableScript, scope)
		logger().info('Table script loaded, transpiled and executed.')
	}

	public broadcastInit(): void {
		this.events!.fireVoidEvent(Event.GameEventsInit)
		for (const h of this.getHittables()) h.getEventProxy().fireVoidEvent(Event.GameEventsInit)
	}
	public fireVoidEvent(event: Event): this {
		this.events!.fireVoidEvent(event)
		return this
	}

	public setupCollections(): void {
		for (const item of Object.values(this.items))
			if (isScriptable(item as any)) (item as unknown as IScriptable<any>).getApi()._resetCollections()
		for (const col of Object.values(this.collections))
			for (const name of col.getItemNames()) {
				const item = this.items[name]
				if (!item) {
					logger().warn('Non-existent item "%s" in collection "%s", skipping.', name, col.getName())
					break
				}
				if (isScriptable(item as any)) {
					;(item as unknown as IScriptable<any>).getApi()._addCollection(col, col.items.length)
					col.items.push((item as unknown as IScriptable<any>).getApi())
				}
			}
	}

	public getItems(): Array<Item<ItemData>> {
		return Object.values(this.items)
	}
}

const defaultTableLoadOptions: TableLoadOptions = {
	tableDataOnly: false,
	tableInfoOnly: false,
	loadInvisibleItems: true,
	loadTableScript: true,
}

/** Options for loading a table. */
export interface TableLoadOptions {
	/** Only parse game data, skip items (faster). */
	tableDataOnly?: boolean
	/** Only parse table info, skip storage. */
	tableInfoOnly?: boolean
	/** Also parse invisible items (timers, etc.). */
	loadInvisibleItems?: boolean
	/** Read table script. */
	loadTableScript?: boolean
	/** Skip primitive mesh data. */
	skipMeshes?: boolean
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
