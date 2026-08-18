// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EventProxy } from '../../game/event-proxy.js'
import type { IHittable } from '../../game/ihittable.js'
import type { IRenderable, Meshes } from '../../game/irenderable.js'
import type { IScriptable } from '../../game/iscriptable.js'
import type { Player } from '../../game/player.js'
import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import type { HitObject } from '../../physics/hit-object.js'
import { Matrix3D } from '../../util/matrix.js'
import { handleBiffTag } from '../biff-helper.js'
import { DragPoint } from '../dragpoint.js'
import { Item } from '../item.js'
import { ItemApi } from '../item-api.js'
import { type IPhysicalData, ItemData } from '../item-data.js'
import { ItemState } from '../item-state.js'
import type { Material } from '../material.js'
import { omitEqual } from '../state-helpers.js'
import type { Table } from '../table/table.js'
import { SurfaceHitGenerator } from './surface-physics.js'
import { SurfaceMeshGenerator, SurfaceUpdater } from './surface-view.js'

const BOOL_MAP: Record<string, string> = {
	HTEV: 'hitEvent',
	DROP: 'isDroppable',
	FLIP: 'isFlipbook',
	ISBS: 'isBottomSolid',
	CLDW: 'isCollidable',
	INNR: 'inner',
	DSPT: 'displayTexture',
	VSBL: 'isTopBottomVisible',
	OVPH: 'overwritePhysics',
	SLGA: 'slingshotAnimation',
	SVBL: 'isSideVisible',
	REEN: 'isReflectionEnabled',
}
const FLOAT_MAP: Record<string, string> = {
	THRS: 'threshold',
	HTBT: 'heightBottom',
	HTTP: 'heightTop',
	SLGF: 'slingshotForce',
	SLTH: 'slingshotThreshold',
	ELAS: 'elasticity',
	ELFO: 'elasticityFalloff',
	WFCT: 'friction',
	WSCT: 'scatter',
	DILI: 'disableLightingTop',
	DILT: 'disableLightingTop',
	DILB: 'disableLightingBelow',
}
const STRING_MAP: Record<string, string> = {
	IMAG: 'szImage',
	SIMG: 'szSideImage',
	MAPH: 'szPhysicsMaterial',
}

/** Surface data.
 * @see https://github.com/vpinball/vpinball/blob/master/surface.cpp */
export class SurfaceData extends ItemData implements IPhysicalData {
	public hitEvent = false
	public isDroppable = false
	public isFlipbook = false
	public isBottomSolid = false
	public isCollidable = true
	public threshold = 2.0
	public szImage?: string
	public szSideImage?: string
	public szSideMaterial?: string
	public szTopMaterial?: string
	public szPhysicsMaterial?: string
	public szSlingShotMaterial?: string
	public heightBottom = 0
	public heightTop = 50
	public inner = true
	public displayTexture = true
	public slingshotForce = 80
	public slingshotThreshold = 0
	public slingshotAnimation = true
	public elasticity = 0.3
	public elasticityFalloff = 0
	public friction = 0.3
	public scatter = 0
	public isTopBottomVisible = true
	public overwritePhysics = true
	public disableLightingTop = 0
	public disableLightingBelow = 1
	public isSideVisible = true
	public isReflectionEnabled = true
	public dragPoints: DragPoint[] = []
	public isDisabled = false

	public static async fromStorage(storage: Storage, itemName: string): Promise<SurfaceData> {
		const d = new SurfaceData(itemName)
		await storage.streamFiltered(itemName, 4, SurfaceData.createStreamHandler(d))
		return d
	}

	private static createStreamHandler(d: SurfaceData) {
		d.dragPoints = []
		return BiffParser.stream(d.fromTag.bind(d), {
			nestedTags: {
				DPNT: {
					onStart: () => new DragPoint(),
					onTag: dp => dp.fromTag.bind(dp),
					onEnd: dp => d.dragPoints.push(dp),
				},
			},
		})
	}

	public constructor(itemName: string) {
		super(itemName)
	}

	private async fromTag(buffer: Uint8Array, tag: string, _offset: number, len: number): Promise<number> {
		if (
			handleBiffTag(this, tag, buffer, len, {
				float: FLOAT_MAP,
				bool: BOOL_MAP,
				string: STRING_MAP,
			})
		)
			return 0
		if (tag === 'MATR') {
			this.szTopMaterial = this.getString(buffer, len)
			return 0
		}
		if (tag === 'TMTR') {
			this.szSideMaterial = this.getString(buffer, len)
			return 0
		}
		if (tag === 'SMAT') {
			this.szSlingShotMaterial = this.getString(buffer, len)
			return 0
		}
		this.getCommonBlock(buffer, tag, len)
		return 0
	}
}

/** Surface state. @see https://github.com/vpinball/vpinball/blob/master/surface.cpp */
export class SurfaceState extends ItemState {
	public isDropped = false

	public isTopVisible = true
	public topMaterial?: string
	public topTexture?: string

	public isSideVisible = true
	public sideMaterial?: string
	public sideTexture?: string

	// @ts-expect-error
	get isVisible(): boolean {
		return this.isTopVisible || this.isSideVisible
	}
	/** Set isVisible. */
	set isVisible(_v) {
		/* not used in abstract */
	}

	public static claim(
		name: string,
		isDropped: boolean,
		isTopVisible: boolean,
		topMaterial: string | undefined,
		topTexture: string | undefined,
		isSideVisible: boolean,
		sideMaterial: string | undefined,
		sideTexture: string | undefined,
	): SurfaceState {
		const state = new SurfaceState()
		state.name = name
		state.isDropped = isDropped
		state.isTopVisible = isTopVisible
		state.topMaterial = topMaterial
		state.topTexture = topTexture
		state.isSideVisible = isSideVisible
		state.sideMaterial = sideMaterial
		state.sideTexture = sideTexture
		return state
	}

	public clone(): SurfaceState {
		return SurfaceState.claim(
			this.name,
			this.isDropped,
			this.isTopVisible,
			this.topMaterial,
			this.topTexture,
			this.isSideVisible,
			this.sideMaterial,
			this.sideTexture,
		)
	}

	public diff(state: SurfaceState): SurfaceState {
		const d = this.clone()
		omitEqual(d, state, 'isDropped')
		omitEqual(d, state, 'isTopVisible')
		omitEqual(d, state, 'topMaterial')
		omitEqual(d, state, 'topTexture')
		omitEqual(d, state, 'isSideVisible')
		omitEqual(d, state, 'sideMaterial')
		omitEqual(d, state, 'sideTexture')
		return d
	}

	public release(): void {}

	public equals(state: SurfaceState): boolean {
		if (!state) return false
		return (
			state.isDropped === this.isDropped &&
			state.isTopVisible === this.isTopVisible &&
			state.topMaterial === this.topMaterial &&
			state.topTexture === this.topTexture &&
			state.isSideVisible === this.isSideVisible &&
			state.sideMaterial === this.sideMaterial &&
			state.sideTexture === this.sideTexture
		)
	}
}

/** Surface API — VBS surface for `Surface`/`Wall`. @see https://github.com/vpinball/vpinball/blob/master/surface.cpp */
export class SurfaceApi extends ItemApi<SurfaceData> {
	private isDynamic = false

	constructor(
		private readonly _state: SurfaceState,
		data: SurfaceData,
		private readonly hits: HitObject[],
		private readonly hitGenerator: SurfaceHitGenerator,
		events: EventProxy,
		player: Player,
		table: Table,
	) {
		super(data, events, player, table)
		this.isDynamic = this.data.isDroppable
		if (!this.isDynamic && this.data.isSideVisible) {
			const m = table.getMaterial(this.data.szSideMaterial)
			if (m?.isOpacityActive) this.isDynamic = true
		}
		if (!this.isDynamic && this.data.isTopBottomVisible) {
			const m = table.getMaterial(this.data.szTopMaterial)
			if (m?.isOpacityActive) this.isDynamic = true
		}
	}

	get HasHitEvent() {
		return this.data.hitEvent
	}
	set HasHitEvent(v) {
		this.data.hitEvent = v
	}
	get Threshold() {
		return this.data.threshold
	}
	set Threshold(v) {
		this.data.threshold = v
	}
	get Image() {
		return this.data.szImage
	}
	set Image(v) {
		if (this.isDynamic) this._state.topTexture = v
		this.data.szImage = v
	}
	get SideMaterial() {
		return this.data.szSideMaterial
	}
	set SideMaterial(v) {
		if (this.isDynamic) this._state.sideMaterial = v
		this.data.szSideMaterial = v
	}
	get SlingshotMaterial() {
		return this.data.szSlingShotMaterial
	}
	set SlingshotMaterial(v) {
		this.data.szSlingShotMaterial = v
	}
	/** @deprecated */
	public ImageAlignment: unknown = null
	get HeightBottom() {
		return this.data.heightBottom
	}
	set HeightBottom(v) {
		this.data.heightBottom = v
	}
	get HeightTop() {
		return this.data.heightTop
	}
	set HeightTop(v) {
		this.data.heightTop = v
	}
	get TopMaterial() {
		return this.data.szTopMaterial
	}
	set TopMaterial(v) {
		if (this.isDynamic) this._state.topMaterial = v
		this.data.szTopMaterial = v
	}
	get PhysicsMaterial() {
		return this.data.szPhysicsMaterial
	}
	set PhysicsMaterial(v) {
		this.data.szPhysicsMaterial = v
	}
	get OverwritePhysics() {
		return this.data.overwritePhysics
	}
	set OverwritePhysics(v) {
		this.data.overwritePhysics = v
	}
	get CanDrop() {
		return this.data.isDroppable
	}
	set CanDrop(v) {
		this.data.isDroppable = v
	}
	get FlipbookAnimation() {
		return this.data.isFlipbook
	}
	set FlipbookAnimation(v) {
		this.data.isFlipbook = v
	}
	get IsBottomSolid() {
		return this.data.isBottomSolid
	}
	set IsBottomSolid(v) {
		this.data.isBottomSolid = v
	}
	get IsDropped() {
		return this._state.isDropped
	}
	set IsDropped(v) {
		this._setDropped(v)
	}
	get DisplayTexture() {
		return this.data.displayTexture
	}
	set DisplayTexture(v) {
		this.data.displayTexture = v
	}
	get SlingshotStrength() {
		return this.data.slingshotForce
	}
	set SlingshotStrength(v) {
		this.data.slingshotForce = v
	}
	get Elasticity() {
		return this.data.elasticity
	}
	set Elasticity(v) {
		this.data.elasticity = v
	}
	get Friction() {
		return this.data.friction
	}
	set Friction(v) {
		this.data.friction = v
	}
	get Scatter() {
		return this.data.scatter
	}
	set Scatter(v) {
		this.data.scatter = v
	}
	get Visible() {
		return this.data.isTopBottomVisible
	}
	set Visible(v) {
		if (this.isDynamic) this._state.isTopVisible = v
		this.data.isTopBottomVisible = v
	}
	get SideImage() {
		return this.data.szSideImage
	}
	set SideImage(v) {
		this._assertNonHdrImage(v)
		if (this.isDynamic) this._state.sideTexture = v
		this.data.szSideImage = v
	}
	get Disabled() {
		return this.data.isDisabled
	}
	set Disabled(v) {
		this.data.isDisabled = v
	}
	get SideVisible() {
		return this.data.isSideVisible
	}
	set SideVisible(v) {
		if (this.isDynamic) this._state.isSideVisible = v
		this.data.isSideVisible = v
	}
	get Collidable() {
		return this.data.isCollidable
	}
	set Collidable(v) {
		this._setCollidable(v)
	}
	get SlingshotThreshold() {
		return this.data.slingshotThreshold
	}
	set SlingshotThreshold(v) {
		this.data.slingshotThreshold = v
	}
	get SlingshotAnimation() {
		return this.data.slingshotAnimation
	}
	set SlingshotAnimation(v) {
		this.data.slingshotAnimation = v
	}
	get DisableLighting() {
		return !!this.data.disableLightingTop
	}
	set DisableLighting(v) {
		this.data.disableLightingTop = v ? 1 : 0
	}
	get BlendDisableLighting() {
		return this.data.disableLightingTop
	}
	set BlendDisableLighting(v) {
		this.data.disableLightingTop = v
	}
	get BlendDisableLightingFromBelow() {
		return this.data.disableLightingBelow
	}
	set BlendDisableLightingFromBelow(v) {
		this.data.disableLightingBelow = v
	}
	get ReflectionEnabled() {
		return this.data.isReflectionEnabled
	}
	set ReflectionEnabled(v) {
		this.data.isReflectionEnabled = v
	}

	public PlaySlingshotHit(): void {
		for (const slingLine of this.hitGenerator.lineSling) slingLine.doHitEvent = true
	}

	private _setDropped(isDropped: boolean): void {
		if (!this.data.isDroppable) throw new Error(`Surface "${this.Name}" is not droppable.`)
		if (this._state.isDropped !== isDropped) {
			this._state.isDropped = isDropped
			const b = !this._state.isDropped && this.data.isCollidable
			if (this.hits.length > 0 && this.hits[0]!.isEnabled !== b) for (const drop of this.hits) drop.setEnabled(b)
		}
	}

	private _setCollidable(isCollidable: boolean): void {
		const b = this.data.isDroppable ? isCollidable && !this._state.isDropped : isCollidable
		if (this.hits.length > 0 && this.hits[0]!.isEnabled !== b) for (const hit of this.hits) hit.isEnabled = b
	}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(SurfaceApi.prototype)
	}
}

/** Surface item. @see https://github.com/vpinball/vpinball/blob/master/surface.cpp */
export class Surface
	extends Item<SurfaceData>
	implements IRenderable<SurfaceState>, IHittable, IScriptable<SurfaceApi>
{
	private readonly state: SurfaceState
	private readonly meshGenerator: SurfaceMeshGenerator
	private readonly hitGenerator: SurfaceHitGenerator
	private readonly updater: SurfaceUpdater
	private hits: HitObject[] = []
	private drops: HitObject[] = []
	private api?: SurfaceApi

	get heightTop() {
		return this.data.heightTop
	}
	get image() {
		return this.data.szImage
	}

	public static async fromStorage(storage: Storage, itemName: string): Promise<Surface> {
		const data = await SurfaceData.fromStorage(storage, itemName)
		return new Surface(data)
	}

	public constructor(data: SurfaceData) {
		super(data)
		this.state = SurfaceState.claim(
			data.getName(),
			false,
			data.isTopBottomVisible,
			data.szTopMaterial,
			data.szImage,
			data.isSideVisible,
			data.szSideMaterial,
			data.szSideImage,
		)
		this.meshGenerator = new SurfaceMeshGenerator()
		this.hitGenerator = new SurfaceHitGenerator(this, data)
		this.updater = new SurfaceUpdater(this.state, this.data)
	}

	public isCollidable(): boolean {
		return this.data.isCollidable
	}

	private static isTransparentMat(m?: Material): boolean {
		return !m || (m.isOpacityActive && m.opacity < 0.999)
	}

	public isTransparent(table: Table): boolean {
		if (this.data.isSideVisible && Surface.isTransparentMat(table.getMaterial(this.data.szSideMaterial)))
			return true
		if (this.data.isTopBottomVisible && Surface.isTransparentMat(table.getMaterial(this.data.szTopMaterial)))
			return true
		return false
	}

	public getMeshes<GEOMETRY>(table: Table): Meshes<GEOMETRY> {
		const meshes: Meshes<GEOMETRY> = {}
		const surface = this.meshGenerator.generateMeshes(this.data, table)
		if (surface.top) {
			meshes.top = {
				isVisible: this.data.isTopBottomVisible,
				mesh: surface.top.transform(Matrix3D.RIGHT_HANDED),
				map: table.getTexture(this.data.szImage),
				material: table.getMaterial(this.data.szTopMaterial),
				isTransparent: Surface.isTransparentMat(table.getMaterial(this.data.szTopMaterial)),
				disableLighting: this.data.disableLightingTop,
			}
		}
		if (surface.side) {
			meshes.side = {
				isVisible: this.data.isSideVisible,
				mesh: surface.side.transform(Matrix3D.RIGHT_HANDED),
				map: table.getTexture(this.data.szSideImage),
				material: table.getMaterial(this.data.szSideMaterial),
				isTransparent: Surface.isTransparentMat(table.getMaterial(this.data.szSideMaterial)),
			}
		}
		return meshes
	}

	public setupPlayer(player: Player, table: Table): void {
		this.events = new EventProxy(this)
		this.hits = this.hitGenerator.generateHitObjects(this.events, player.getPhysics(), table)
		this.drops = this.data.isCollidable ? this.hits : []
		this.api = new SurfaceApi(this.state, this.data, this.hits, this.hitGenerator, this.events, player, table)
	}

	public getApi(): SurfaceApi {
		return this.api!
	}

	public getState(): SurfaceState {
		return this.state
	}

	public getUpdater(): SurfaceUpdater {
		return this.updater
	}

	public getHitShapes(): HitObject[] {
		return this.hits
	}

	public getEventProxy(): EventProxy {
		return this.events!
	}

	public getEventNames(): string[] {
		return ['Init', 'Hit', 'Slingshot', 'Timer']
	}
}
