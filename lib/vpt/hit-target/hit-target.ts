// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { MathUtils } from 'three'
import { EventProxy } from '../../game/event-proxy.js'
import type { IAnimatable } from '../../game/ianimatable.js'
import type { IHittable } from '../../game/ihittable.js'
import type { IRenderable, Meshes } from '../../game/irenderable.js'
import type { IScriptable } from '../../game/iscriptable.js'
import type { Player } from '../../game/player.js'
import type { PlayerPhysics } from '../../game/player-physics.js'
import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import type { HitObject } from '../../physics/hit-object.js'
import { Matrix3D } from '../../util/matrix.js'
import { Vertex3D } from '../../util/vector.js'
import type { Ball } from '../ball/ball.js'
import { handleBiffTag } from '../biff-helper.js'
import { Enums } from '../enums.js'
import { Item } from '../item.js'
import { ItemApi } from '../item-api.js'
import { type IPhysicalData, ItemData } from '../item-data.js'
import { ItemState } from '../item-state.js'
import { omitEqual } from '../state-helpers.js'
import type { Table } from '../table/table.js'
import { HitTargetAnimation, HitTargetHitGenerator } from './hit-target-physics.js'
import { HitTargetMeshGenerator, HitTargetUpdater } from './hit-target-view.js'

const FLOAT_MAP: Record<string, string> = {
	ROTZ: 'rotZ',
	DRSP: 'dropSpeed',
	THRS: 'threshold',
	ELAS: 'elasticity',
	ELFO: 'elasticityFalloff',
	RFCT: 'friction',
	RSCT: 'scatter',
	DILI: 'disableLightingTop',
	DILT: 'disableLightingTop',
	DILB: 'disableLightingBelow',
	PIDB: 'depthBias',
}
const INT_MAP: Record<string, string> = { TRTY: 'targetType', RADE: 'raiseDelay' }
const BOOL_MAP: Record<string, string> = {
	TVIS: 'isVisible',
	LEMO: 'legacy',
	ISDR: 'isDropped',
	REEN: 'isReflectionEnabled',
	HTEV: 'useHitEvent',
	CLDR: 'isCollidable',
	OVPH: 'overwritePhysics',
}
const STRING_MAP: Record<string, string> = { IMAG: 'szImage', MATR: 'szMaterial', MAPH: 'szPhysicsMaterial' }

/** HitTarget data.
 * @see https://github.com/vpinball/vpinball/blob/master/hittarget.cpp */
export class HitTargetData extends ItemData implements IPhysicalData {
	public depthBias?: number
	public disableLightingBelow?: number
	public disableLightingTop?: number
	public dropSpeed = 0.2
	public isReflectionEnabled = true
	public raiseDelay = 100
	public elasticity = 0.35
	public elasticityFalloff = 0.5
	public friction = 0.2
	public isCollidable = true
	public isDropped = false
	public isVisible = true
	public legacy = false
	public overwritePhysics = false
	public rotZ = 0
	public scatter = 5
	public szImage?: string
	public szMaterial?: string
	public szPhysicsMaterial?: string
	public targetType: number = Enums.TargetType.DropTargetSimple
	public threshold = 2.0
	public useHitEvent = true
	public position: Vertex3D = new Vertex3D()
	public vSize: Vertex3D = new Vertex3D(32, 32, 32)

	public static async fromStorage(storage: Storage, itemName: string): Promise<HitTargetData> {
		const d = new HitTargetData(itemName)
		await storage.streamFiltered(itemName, 4, BiffParser.stream(d.fromTag.bind(d)))
		return d
	}

	public constructor(itemName: string) {
		super(itemName)
	}

	public isDropTarget(): boolean {
		return (
			this.targetType === Enums.TargetType.DropTargetBeveled ||
			this.targetType === Enums.TargetType.DropTargetFlatSimple ||
			this.targetType === Enums.TargetType.DropTargetSimple
		)
	}

	private async fromTag(buffer: Uint8Array, tag: string, _offset: number, len: number): Promise<number> {
		if (tag === 'VPOS') {
			this.position = Vertex3D.get(buffer)
			return 0
		}
		if (tag === 'VSIZ') {
			this.vSize = Vertex3D.get(buffer)
			return 0
		}
		if (
			handleBiffTag(this, tag, buffer, len, {
				float: FLOAT_MAP,
				int: INT_MAP,
				bool: BOOL_MAP,
				string: STRING_MAP,
			})
		)
			return 0
		this.getCommonBlock(buffer, tag, len)
		return 0
	}
}

/** Hit target state — drop offset, rotation and appearance.
 * @see https://github.com/vpinball/vpinball/blob/master/hittarget.cpp */
export class HitTargetState extends ItemState {
	public zOffset = 0
	public xRotation = 0
	public material?: string
	public texture?: string

	public static claim(
		name: string,
		zOffset: number,
		xRotation: number,
		material: string | undefined,
		texture: string | undefined,
		isVisible: boolean,
	): HitTargetState {
		const s = new HitTargetState()
		s.name = name
		s.zOffset = zOffset
		s.xRotation = xRotation
		s.material = material
		s.texture = texture
		s.isVisible = isVisible
		return s
	}

	public clone(): HitTargetState {
		return HitTargetState.claim(
			this.name,
			this.zOffset,
			this.xRotation,
			this.material,
			this.texture,
			this.isVisible,
		)
	}

	public override copyFrom(state: ItemState): void {
		const s = state as HitTargetState
		this.name = s.name
		this.zOffset = s.zOffset
		this.xRotation = s.xRotation
		this.material = s.material
		this.texture = s.texture
		this.isVisible = s.isVisible
	}

	public diff(state: HitTargetState): HitTargetState {
		const d = this.clone()
		omitEqual(d, state, 'zOffset')
		omitEqual(d, state, 'xRotation')
		omitEqual(d, state, 'material')
		omitEqual(d, state, 'texture')
		omitEqual(d, state, 'isVisible')
		return d
	}

	public release(): void {}

	public equals(state: HitTargetState): boolean {
		if (!state) return false
		return (
			state.zOffset === this.zOffset &&
			state.xRotation === this.xRotation &&
			state.material === this.material &&
			state.texture === this.texture &&
			state.isVisible === this.isVisible
		)
	}
}

/** Hit target API — VBS surface for `HitTarget`. @see https://github.com/vpinball/vpinball/blob/master/hittarget.cpp */
export class HitTargetApi extends ItemApi<HitTargetData> {
	constructor(
		private readonly _state: HitTargetState,
		data: HitTargetData,
		private readonly hits: HitObject[],
		private readonly animation: HitTargetAnimation,
		events: EventProxy,
		player: Player,
		table: Table,
	) {
		super(data, events, player, table)
	}

	get Image() {
		return this._state.texture
	}
	set Image(v) {
		this._assertNonHdrImage(v)
		this._state.texture = v
	}
	get Material() {
		return this._state.material
	}
	set Material(v) {
		this._state.material = v
	}
	get Visible() {
		return this._state.isVisible
	}
	set Visible(v) {
		this._state.isVisible = v
	}
	get X() {
		return this.data.position.x
	}
	set X(v) {
		this.data.position.x = v
	}
	get Y() {
		return this.data.position.y
	}
	set Y(v) {
		this.data.position.y = v
	}
	get Z() {
		return this.data.position.z
	}
	set Z(v) {
		this.data.position.z = v
	}
	get ScaleX() {
		return this.data.vSize.x
	}
	set ScaleX(v) {
		this.data.vSize.x = v
	}
	get ScaleY() {
		return this.data.vSize.y
	}
	set ScaleY(v) {
		this.data.vSize.y = v
	}
	get ScaleZ() {
		return this.data.vSize.z
	}
	set ScaleZ(v) {
		this.data.vSize.z = v
	}
	get Orientation() {
		return this.data.rotZ
	}
	set Orientation(v) {
		this.data.rotZ = v
	}
	get HasHitEvent() {
		return this.data.useHitEvent
	}
	set HasHitEvent(v) {
		this.data.useHitEvent = v
	}
	get Threshold() {
		return this.data.threshold
	}
	set Threshold(v) {
		this.data.threshold = v
	}
	get Elasticity() {
		return this.data.elasticity
	}
	set Elasticity(v) {
		this.data.elasticity = v
	}
	get ElasticityFalloff() {
		return this.data.elasticityFalloff
	}
	set ElasticityFalloff(v) {
		this.data.elasticityFalloff = v
	}
	get Friction() {
		return this.data.friction
	}
	set Friction(v) {
		this.data.friction = MathUtils.clamp(v, 0, 1)
	}
	get Scatter() {
		return this.data.scatter
	}
	set Scatter(v) {
		this.data.scatter = v
	}
	get Collidable() {
		return this.data.isCollidable
	}
	set Collidable(v) {
		this._setCollidable(v)
	}
	get IsDropped() {
		return this.data.isDropped
	}
	set IsDropped(v) {
		this._setDropped(v, this.table, this.player.getPhysics())
	}
	get DropSpeed() {
		return this.data.dropSpeed
	}
	set DropSpeed(v) {
		this.data.dropSpeed = v
	}
	get TargetType() {
		return this.data.targetType
	}
	set TargetType(v) {
		this.data.targetType = v
	}
	get Legacy() {
		return this.data.legacy
	}
	set Legacy(v) {
		this.data.legacy = v
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
	get DepthBias() {
		return this.data.depthBias
	}
	set DepthBias(v) {
		this.data.depthBias = v
	}
	get HitThreshold() {
		return this.events.currentHitThreshold
	}
	get RaiseDelay() {
		return this.data.raiseDelay
	}
	set RaiseDelay(v) {
		this.data.raiseDelay = v
	}

	public Hit(): void {
		if (this.animation) this.animation.hitEvent = true
	}

	private _setCollidable(isCollidable: boolean): void {
		if (this.hits?.length && this.hits[0].isEnabled !== isCollidable)
			for (const hit of this.hits) hit.isEnabled = isCollidable
		this.data.isCollidable = isCollidable
	}

	private _setDropped(val: boolean, table: Table, physics: PlayerPhysics): void {
		if (this.data.isDropped !== val && this.animation) {
			if (val) {
				this.animation.moveAnimation = true
				this._state.zOffset = 0
				this.animation.moveDown = true
			} else {
				this.animation.moveAnimation = true
				this._state.zOffset = -HitTarget.DROP_TARGET_LIMIT * table.getScaleZ()
				this.animation.moveDown = false
				this.animation.timeStamp = physics.timeMsec
			}
		} else this.data.isDropped = val
	}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(HitTargetApi.prototype)
	}
}

/** HitTarget item. @see https://github.com/vpinball/vpinball/blob/master/hittarget.cpp */
export class HitTarget
	extends Item<HitTargetData>
	implements IRenderable<HitTargetState>, IHittable, IAnimatable, IScriptable<HitTargetApi>
{
	public static DROP_TARGET_LIMIT = 52.0

	private readonly state: HitTargetState
	private readonly meshGenerator: HitTargetMeshGenerator
	private readonly hitGenerator: HitTargetHitGenerator
	private readonly updater: HitTargetUpdater
	private animation?: HitTargetAnimation
	private hits?: HitObject[]
	private api?: HitTargetApi

	public static async fromStorage(storage: Storage, itemName: string): Promise<HitTarget> {
		const data = await HitTargetData.fromStorage(storage, itemName)
		return new HitTarget(data)
	}

	public constructor(data: HitTargetData) {
		super(data)
		this.state = HitTargetState.claim(this.data.getName(), 0.0, 0.0, data.szMaterial, data.szImage, data.isVisible)
		this.meshGenerator = new HitTargetMeshGenerator(data)
		this.hitGenerator = new HitTargetHitGenerator(data, this.meshGenerator)
		this.updater = new HitTargetUpdater(this.data, this.state)
	}

	public isCollidable(): boolean {
		return this.data.isCollidable
	}

	public getMeshes<GEOMETRY>(table: Table): Meshes<GEOMETRY> {
		const m = table.getMaterial(this.data.szMaterial)
		const isTransparent = !m || (m.isOpacityActive && m.opacity < 0.999)
		return {
			hitTarget: {
				mesh: this.meshGenerator.getMesh(table).transform(Matrix3D.RIGHT_HANDED),
				isVisible: this.data.isVisible,
				material: m,
				isTransparent,
				map: table.getTexture(this.data.szImage),
				depthBias: this.data.depthBias,
				disableLighting: this.data.disableLightingTop,
			},
		}
	}

	public setupPlayer(player: Player, table: Table): void {
		this.events = new EventProxy(this)
		this.events.onCollision = (obj: HitObject, ball: Ball, dot: number) => {
			if (!this.data.isDropped) {
				this.animation!.hitEvent = true
				this.events!.currentHitThreshold = dot
				obj.fireHitEvent(ball)
			}
		}
		this.events.abortHitTest = () => {
			return this.data.isDropped
		}
		this.animation = new HitTargetAnimation(this.data, this.state, this.events)
		this.hits = this.hitGenerator.generateHitObjects(this.events, table)
		this.api = new HitTargetApi(this.state, this.data, this.hits, this.animation, this.events, player, table)
	}

	public getApi(): HitTargetApi {
		return this.api!
	}

	public getEventNames(): string[] {
		return ['Dropped', 'Hit', 'Init', 'Raised', 'Timer']
	}

	public getHitShapes(): HitObject[] {
		return this.hits!
	}

	public getAnimation(): HitTargetAnimation {
		return this.animation!
	}

	public getState(): HitTargetState {
		return this.state
	}

	public getUpdater(): HitTargetUpdater {
		return this.updater
	}
}
