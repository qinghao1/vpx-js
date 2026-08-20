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
import { Vertex2D } from '../../util/vector.js'
import { handleBiffTag } from '../biff-helper.js'
import { DragPoint } from '../dragpoint.js'
import { Enums } from '../enums.js'
import { Item } from '../item.js'
import { ItemApi } from '../item-api.js'
import { type IPhysicalData, ItemData } from '../item-data.js'
import { ItemState } from '../item-state.js'
import { Mesh } from '../mesh.js'
import { omitEqual } from '../state-helpers.js'
import type { Table } from '../table/table.js'
import { RampHitGenerator } from './ramp-physics.js'
import { RampMeshGenerator, RampUpdater } from './ramp-view.js'

const FLOAT_MAP: Record<string, string> = {
	HTBT: 'heightBottom',
	HTTP: 'heightTop',
	WDBT: 'widthBottom',
	WDTP: 'widthTop',
	WLHL: 'leftWallHeight',
	WLHR: 'rightWallHeight',
	WVHL: 'leftWallHeightVisible',
	WVHR: 'rightWallHeightVisible',
	THRS: 'threshold',
	ELAS: 'elasticity',
	RFCT: 'friction',
	RSCT: 'scatter',
	RADB: 'depthBias',
	RADI: 'wireDiameter',
	RADX: 'wireDistanceX',
	RADY: 'wireDistanceY',
}
const BOOL_MAP: Record<string, string> = {
	IMGW: 'imageWalls',
	HTEV: 'hitEvent',
	CLDR: 'isCollidable',
	RVIS: 'isVisible',
	REEN: 'isReflectionEnabled',
	OVPH: 'overwritePhysics',
}
const STRING_MAP: Record<string, string> = { MATR: 'szMaterial', IMAG: 'szImage', MAPH: 'szPhysicsMaterial' }

/** Ramp data.
 * @see https://github.com/vpinball/vpinball/blob/master/ramp.cpp */
export class RampData extends ItemData implements IPhysicalData {
	public depthBias = 0
	public dragPoints: DragPoint[] = []
	public elasticity = 0.3
	public friction = 0.3
	public hitEvent = false
	public heightBottom = 0
	public heightTop = 50
	public imageAlignment = Enums.RampImageAlignment.ImageModeWorld
	public imageWalls = true
	public isCollidable = true
	public isReflectionEnabled = true
	public isVisible = true
	public leftWallHeight = 62
	public leftWallHeightVisible = 30
	public overwritePhysics = true
	public rampType = Enums.RampType.RampTypeFlat
	public rightWallHeight = 62
	public rightWallHeightVisible = 30
	public scatter = 0
	public szImage?: string
	public szMaterial?: string
	public szPhysicsMaterial?: string
	public threshold = 2
	public widthBottom = 75
	public widthTop = 60
	public wireDiameter = 8
	public wireDistanceX = 38
	public wireDistanceY = 88

	public static async fromStorage(storage: Storage, itemName: string): Promise<RampData> {
		const d = new RampData(itemName)
		await storage.streamFiltered(itemName, 4, RampData.createStreamHandler(d))
		if (d.widthTop === 0 && d.widthBottom > 0) d.widthTop = 0.1
		if (d.widthBottom === 0 && d.widthTop > 0) d.widthBottom = 0.1
		return d
	}

	private static createStreamHandler(d: RampData) {
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
		if (tag === 'TYPE') {
			this.rampType = this.getInt(buffer)
			return 0
		}
		if (tag === 'ALGN') {
			this.imageAlignment = this.getInt(buffer)
			return 0
		}
		if (
			handleBiffTag(this, tag, buffer, len, {
				float: FLOAT_MAP,
				bool: BOOL_MAP,
				string: STRING_MAP,
			})
		)
			return 0
		this.getCommonBlock(buffer, tag, len)
		return 0
	}
}

/** Ramp state. @see https://github.com/vpinball/vpinball/blob/master/ramp.cpp */
export class RampState extends ItemState {
	public type?: number

	public heightBottom!: number
	public heightTop!: number
	public widthBottom!: number
	public widthTop!: number
	public leftWallHeight?: number
	public rightWallHeight?: number
	public leftWallHeightVisible!: number
	public rightWallHeightVisible!: number
	public depthBias?: number

	public material?: string
	public texture?: string
	public textureAlignment?: number
	public hasWallImage?: boolean

	public static claim(
		name: string,
		heightBottom: number,
		heightTop: number,
		widthBottom: number,
		widthTop: number,
		leftWallHeight: number | undefined,
		rightWallHeight: number | undefined,
		leftWallHeightVisible: number,
		rightWallHeightVisible: number,
		type: number | undefined,
		material: string | undefined,
		texture: string | undefined,
		textureAlignment: number | undefined,
		hasWallImage: boolean | undefined,
		depthBias: number | undefined,
		isVisible: boolean,
	): RampState {
		const state = new RampState()
		state.name = name
		state.heightBottom = heightBottom
		state.heightTop = heightTop
		state.widthBottom = widthBottom
		state.widthTop = widthTop
		state.leftWallHeight = leftWallHeight
		state.rightWallHeight = rightWallHeight
		state.leftWallHeightVisible = leftWallHeightVisible
		state.rightWallHeightVisible = rightWallHeightVisible
		state.type = type
		state.material = material
		state.texture = texture
		state.textureAlignment = textureAlignment
		state.hasWallImage = hasWallImage
		state.depthBias = depthBias
		state.isVisible = isVisible
		return state
	}

	public clone(): RampState {
		return RampState.claim(
			this.name,
			this.heightBottom,
			this.heightTop,
			this.widthBottom,
			this.widthTop,
			this.leftWallHeight,
			this.rightWallHeight,
			this.leftWallHeightVisible,
			this.rightWallHeightVisible,
			this.type,
			this.material,
			this.texture,
			this.textureAlignment,
			this.hasWallImage,
			this.depthBias,
			this.isVisible,
		)
	}

	public diff(state: RampState): RampState {
		const d = this.clone()
		omitEqual(d, state, 'heightBottom')
		omitEqual(d, state, 'heightTop')
		omitEqual(d, state, 'widthBottom')
		omitEqual(d, state, 'widthTop')
		omitEqual(d, state, 'leftWallHeight')
		omitEqual(d, state, 'rightWallHeight')
		omitEqual(d, state, 'leftWallHeightVisible')
		omitEqual(d, state, 'rightWallHeightVisible')
		omitEqual(d, state, 'depthBias')
		omitEqual(d, state, 'material')
		omitEqual(d, state, 'texture')
		omitEqual(d, state, 'textureAlignment')
		omitEqual(d, state, 'hasWallImage')
		omitEqual(d, state, 'type')
		omitEqual(d, state, 'isVisible')
		return d
	}

	public release(): void {}

	public equals(state: RampState): boolean {
		if (!state) return false
		return (
			state.heightBottom === this.heightBottom &&
			state.heightTop === this.heightTop &&
			state.widthBottom === this.widthBottom &&
			state.widthTop === this.widthTop &&
			state.leftWallHeight === this.leftWallHeight &&
			state.rightWallHeight === this.rightWallHeight &&
			state.leftWallHeightVisible === this.leftWallHeightVisible &&
			state.rightWallHeightVisible === this.rightWallHeightVisible &&
			state.depthBias === this.depthBias &&
			state.material === this.material &&
			state.texture === this.texture &&
			state.textureAlignment === this.textureAlignment &&
			state.hasWallImage === this.hasWallImage &&
			state.type === this.type &&
			state.isVisible === this.isVisible
		)
	}
}

/** Ramp API — VBS surface for `Ramp`. @see https://github.com/vpinball/vpinball/blob/master/ramp.cpp */
export class RampApi extends ItemApi<RampData> {
	private readonly isDynamic: boolean

	constructor(
		private readonly _state: RampState,
		private readonly hits: HitObject[],
		data: RampData,
		events: EventProxy,
		player: Player,
		table: Table,
	) {
		super(data, events, player, table)
		const material = table.getMaterial(data.szMaterial)
		this.isDynamic = !!material && material.isOpacityActive
	}

	get HeightBottom() {
		return this.data.heightBottom
	}
	set HeightBottom(v) {
		if (this.isDynamic) this._state.heightBottom = v
		this.data.heightBottom = v
	}
	get HeightTop() {
		return this.data.heightTop
	}
	set HeightTop(v) {
		if (this.isDynamic) this._state.heightTop = v
		this.data.heightTop = v
	}
	get WidthBottom() {
		return this.data.widthBottom
	}
	set WidthBottom(v) {
		if (this.isDynamic) this._state.widthBottom = v
		this.data.widthBottom = v
	}
	get WidthTop() {
		return this.data.widthTop
	}
	set WidthTop(v) {
		if (this.isDynamic) this._state.widthTop = v
		this.data.widthTop = v
	}
	get Material() {
		return this.data.szMaterial
	}
	set Material(v) {
		if (this.isDynamic) this._state.material = v
		this.data.szMaterial = v
	}
	get Type() {
		return this.data.rampType
	}
	set Type(v) {
		if (this.isDynamic) this._state.type = v
		this.data.rampType = v
	}
	get Image() {
		return this.data.szImage
	}
	set Image(v) {
		this._assertNonHdrImage(v)
		if (this.isDynamic) this._state.texture = v
		this.data.szImage = v
	}
	get ImageAlignment() {
		return this.data.imageAlignment
	}
	set ImageAlignment(v) {
		if (this.isDynamic) this._state.textureAlignment = v
		this.data.imageAlignment = v
	}
	get HasWallImage() {
		return this.data.imageWalls
	}
	set HasWallImage(v) {
		if (this.isDynamic) this._state.hasWallImage = v
		this.data.imageWalls = v
	}
	get LeftWallHeight() {
		return this.data.leftWallHeight
	}
	set LeftWallHeight(v) {
		if (this.isDynamic) this._state.leftWallHeight = v
		this.data.leftWallHeight = v
	}
	get RightWallHeight() {
		return this.data.rightWallHeight
	}
	set RightWallHeight(v) {
		if (this.isDynamic) this._state.rightWallHeight = v
		this.data.rightWallHeight = v
	}
	get VisibleLeftWallHeight() {
		return this.data.leftWallHeightVisible
	}
	set VisibleLeftWallHeight(v) {
		if (this.isDynamic) this._state.leftWallHeightVisible = v
		this.data.leftWallHeightVisible = v
	}
	get VisibleRightWallHeight() {
		return this.data.rightWallHeightVisible
	}
	set VisibleRightWallHeight(v) {
		if (this.isDynamic) this._state.rightWallHeightVisible = v
		this.data.rightWallHeightVisible = v
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
	get Collidable() {
		return this.hits[0].isEnabled
	}
	set Collidable(v) {
		if (v !== this.Collidable) for (const hit of this.hits) hit.isEnabled = v
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
	get Visible() {
		return this.data.isVisible
	}
	set Visible(v) {
		if (this.isDynamic) this._state.isVisible = v
		this.data.isVisible = v
	}
	get ReflectionEnabled() {
		return this.data.isReflectionEnabled
	}
	set ReflectionEnabled(v) {
		this.data.isReflectionEnabled = v
	}
	get DepthBias() {
		return this.data.depthBias
	}
	set DepthBias(v) {
		if (this.isDynamic) this._state.depthBias = v
		this.data.depthBias = v
	}
	get WireDiameter() {
		return this.data.wireDiameter
	}
	set WireDiameter(v) {
		this.data.wireDiameter = v
	}
	get WireDistanceX() {
		return this.data.wireDistanceX
	}
	set WireDistanceX(v) {
		this.data.wireDistanceX = v
	}
	get WireDistanceY() {
		return this.data.wireDistanceY
	}
	set WireDistanceY(v) {
		this.data.wireDistanceY = v
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

	public InterfaceSupportsErrorInfo(_riid: unknown): boolean {
		return false
	}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(RampApi.prototype)
	}
}

/** Ramp item. @see https://github.com/vpinball/vpinball/blob/master/ramp.cpp */
export class Ramp extends Item<RampData> implements IRenderable<RampState>, IHittable, IScriptable<RampApi> {
	private readonly meshGenerator: RampMeshGenerator
	private readonly hitGenerator: RampHitGenerator

	private readonly state: RampState
	private readonly updater: RampUpdater
	private hits?: HitObject[]
	private api?: RampApi

	public static async fromStorage(storage: Storage, itemName: string): Promise<Ramp> {
		const data = await RampData.fromStorage(storage, itemName)
		return new Ramp(data)
	}

	public constructor(data: RampData) {
		super(data)
		this.state = RampState.claim(
			data.getName(),
			data.heightBottom,
			data.heightTop,
			data.widthBottom,
			data.widthTop,
			data.leftWallHeight,
			data.rightWallHeight,
			data.leftWallHeightVisible,
			data.rightWallHeightVisible,
			data.rampType,
			data.szMaterial,
			data.szImage,
			data.imageAlignment,
			data.imageWalls,
			data.depthBias,
			data.isVisible && data.widthTop > 0 && data.widthBottom > 0,
		)
		this.meshGenerator = new RampMeshGenerator(data, this.state)
		this.hitGenerator = new RampHitGenerator(data, this.meshGenerator)
		this.updater = new RampUpdater(this.state, this.meshGenerator)
	}

	public isCollidable(): boolean {
		return this.data.isCollidable
	}

	public getMeshes<GEOMETRY>(table: Table): Meshes<GEOMETRY> {
		const material = table.getMaterial(this.data.szMaterial)
		const isTransparent = !material || (material.isOpacityActive && material.opacity < 0.999)
		return this.meshGenerator.getMeshes(isTransparent, table)
	}

	public setupPlayer(player: Player, table: Table): void {
		this.events = new EventProxy(this)
		this.hits = this.hitGenerator.generateHitObjects(table, this.events)
		this.api = new RampApi(this.state, this.hits, this.data, this.events, player, table)
	}

	public getApi(): RampApi {
		return this.api!
	}

	public getHitShapes(): HitObject[] {
		return this.hits!
	}

	public getState(): RampState {
		return this.state
	}

	public getUpdater(): RampUpdater {
		return this.updater
	}

	public getEventNames(): string[] {
		return ['Hit', 'Init', 'Timer']
	}

	public getSurfaceHeight(x: number, y: number, table: Table): number {
		const vVertex = this.meshGenerator.getCentralCurve(table)
		let iSeg: number
		let vOut: Vertex2D
		;[vOut, iSeg] = Mesh.closestPointOnPolygon(vVertex, new Vertex2D(x, y), false)
		if (iSeg === -1) return 0
		let totalLength = 0
		let startLength = 0
		const cVertex = vVertex.length
		for (let i2 = 1; i2 < cVertex; i2++) {
			const vDx = vVertex[i2]!.x - vVertex[i2 - 1]!.x
			const vDy = vVertex[i2]!.y - vVertex[i2 - 1]!.y
			const vLen = Math.sqrt(vDx * vDx + vDy * vDy)
			if (i2 <= iSeg) startLength = startLength + vLen
			totalLength = totalLength + vLen
		}
		const dx = vOut.x - vVertex[iSeg]!.x
		const dy = vOut.y - vVertex[iSeg]!.y
		const len = Math.sqrt(dx * dx + dy * dy)
		startLength = startLength + len
		const topHeight = this.data.heightTop + table.getTableHeight()
		const bottomHeight = this.data.heightBottom + table.getTableHeight()
		return (vVertex[iSeg]?.z ?? 0) + (startLength / totalLength) * (topHeight - bottomHeight) + bottomHeight
	}
}
