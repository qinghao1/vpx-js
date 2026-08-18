// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EventProxy } from '../../game/event-proxy.js'
import type { IAnimatable } from '../../game/ianimatable.js'
import type { IHittable } from '../../game/ihittable.js'
import type { IRenderable, Meshes } from '../../game/irenderable.js'
import type { IScriptable } from '../../game/iscriptable.js'
import type { Player } from '../../game/player.js'
import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import type { HitObject } from '../../physics/hit-object.js'
import { Matrix3D } from '../../util/matrix.js'
import { Vertex2D } from '../../util/vector.js'
import { handleBiffTag } from '../biff-helper.js'
import { Item } from '../item.js'
import { ItemApi } from '../item-api.js'
import { ItemData } from '../item-data.js'
import { ItemState } from '../item-state.js'
import { omitEqual } from '../state-helpers.js'
import type { Table } from '../table/table.js'
import { Texture } from '../texture.js'
import { BumperAnimation, BumperHit } from './bumper-physics.js'
import { BumperMeshGenerator, BumperUpdater } from './bumper-view.js'

const FLOAT_TAGS: Record<string, string> = {
	RADI: 'radius',
	THRS: 'threshold',
	FORC: 'force',
	BSCT: 'scatter',
	HISC: 'heightScale',
	RISP: 'ringSpeed',
	ORIN: 'orientation',
	RDLI: 'ringDropOffset',
}
const STRING_TAGS: Record<string, string> = {
	MATR: 'szCapMaterial',
	RIMA: 'szRingMaterial',
	BAMA: 'szBaseMaterial',
	SKMA: 'szSkirtMaterial',
	SURF: 'szSurface',
}
const BOOL_TAGS: Record<string, string> = {
	CAVI: 'isCapVisible',
	HAHE: 'hitEvent',
	COLI: 'isCollidable',
	RIVS: 'isRingVisible',
	SKVS: 'isSkirtVisible',
	REEN: 'isReflectionEnabled',
}

/** Bumper data.
 * @see https://github.com/vpinball/vpinball/blob/master/bumper.cpp */
export class BumperData extends ItemData {
	public center!: Vertex2D
	public radius = 45
	public szCapMaterial?: string
	public szRingMaterial?: string
	public szBaseMaterial?: string
	public szSkirtMaterial?: string
	public threshold = 1.0
	public force = 15.0
	public scatter = 0
	public heightScale = 90.0
	public ringSpeed = 0.5
	public orientation = 0.0
	public ringDropOffset = 0.0
	public szSurface?: string
	public isCapVisible = true
	public isBaseVisible = true
	public isRingVisible = true
	public isSkirtVisible = true
	public hitEvent = true
	public isCollidable = true
	public isReflectionEnabled = true

	public static async fromStorage(storage: Storage, itemName: string): Promise<BumperData> {
		const d = new BumperData(itemName)
		await storage.streamFiltered(itemName, 4, BiffParser.stream(d.fromTag.bind(d)))
		return d
	}

	public constructor(itemName: string) {
		super(itemName)
	}

	private async fromTag(buffer: Uint8Array, tag: string, _offset: number, len: number): Promise<number> {
		if (tag === 'VCEN') {
			this.center = Vertex2D.get(buffer)
			return 0
		}
		if (
			handleBiffTag(this, tag, buffer, len, {
				float: FLOAT_TAGS,
				string: STRING_TAGS,
				bool: BOOL_TAGS,
			})
		)
			return 0
		switch (tag) {
			case 'BVIS': {
				const v = this.getBool(buffer)
				this.isCapVisible = this.isBaseVisible = this.isRingVisible = this.isSkirtVisible = v
				break
			}
			case 'BSVS': {
				const v = this.getBool(buffer)
				this.isBaseVisible = this.isRingVisible = this.isSkirtVisible = v
				break
			}
			default:
				this.getCommonBlock(buffer, tag, len)
				break
		}
		return 0
	}
}

/** Bumper state — ring offset, skirt rotation and material visibility.
 * @see https://github.com/vpinball/vpinball/blob/master/bumper.cpp */
export class BumperState extends ItemState {
	public ringOffset = 0
	public skirtRotX = 0
	public skirtRotY = 0
	public isCapVisible = true
	public isRingVisible = true
	public isBaseVisible = true
	public isSkirtVisible = true
	public capMaterial?: string
	public ringMaterial?: string
	public baseMaterial?: string
	public skirtMaterial?: string

	// @ts-expect-error
	get isVisible(): boolean {
		return this.isCapVisible || this.isRingVisible || this.isBaseVisible || this.isSkirtVisible
	}
	set isVisible(_v: boolean) {}

	public static claim(
		name: string,
		ringOffset: number,
		skirtRotX: number,
		skirtRotY: number,
		isCapVisible: boolean,
		isRingVisible: boolean,
		isBaseVisible: boolean,
		isSkirtVisible: boolean,
		capMaterial: string | undefined,
		ringMaterial: string | undefined,
		baseMaterial: string | undefined,
		skirtMaterial: string | undefined,
	): BumperState {
		const s = new BumperState()
		s.name = name
		s.ringOffset = ringOffset
		s.skirtRotX = skirtRotX
		s.skirtRotY = skirtRotY
		s.isCapVisible = isCapVisible
		s.isRingVisible = isRingVisible
		s.isBaseVisible = isBaseVisible
		s.isSkirtVisible = isSkirtVisible
		s.capMaterial = capMaterial
		s.ringMaterial = ringMaterial
		s.baseMaterial = baseMaterial
		s.skirtMaterial = skirtMaterial
		return s
	}

	public clone(): BumperState {
		return BumperState.claim(
			this.name,
			this.ringOffset,
			this.skirtRotX,
			this.skirtRotY,
			this.isCapVisible,
			this.isRingVisible,
			this.isBaseVisible,
			this.isSkirtVisible,
			this.capMaterial,
			this.ringMaterial,
			this.baseMaterial,
			this.skirtMaterial,
		)
	}

	public override copyFrom(state: ItemState): void {
		const s = state as BumperState
		this.name = s.name
		this.ringOffset = s.ringOffset
		this.skirtRotX = s.skirtRotX
		this.skirtRotY = s.skirtRotY
		this.isCapVisible = s.isCapVisible
		this.isRingVisible = s.isRingVisible
		this.isBaseVisible = s.isBaseVisible
		this.isSkirtVisible = s.isSkirtVisible
		this.capMaterial = s.capMaterial
		this.ringMaterial = s.ringMaterial
		this.baseMaterial = s.baseMaterial
		this.skirtMaterial = s.skirtMaterial
	}

	public diff(state: BumperState): BumperState {
		const d = this.clone()
		omitEqual(d, state, 'ringOffset')
		omitEqual(d, state, 'skirtRotX')
		omitEqual(d, state, 'skirtRotY')
		omitEqual(d, state, 'isCapVisible')
		omitEqual(d, state, 'isRingVisible')
		omitEqual(d, state, 'isBaseVisible')
		omitEqual(d, state, 'isSkirtVisible')
		omitEqual(d, state, 'capMaterial')
		omitEqual(d, state, 'ringMaterial')
		omitEqual(d, state, 'baseMaterial')
		omitEqual(d, state, 'skirtMaterial')
		return d
	}

	public release(): void {}

	public equals(state: BumperState): boolean {
		if (!state) return false
		return (
			state.ringOffset === this.ringOffset &&
			state.skirtRotX === this.skirtRotX &&
			state.skirtRotY === this.skirtRotY &&
			state.isCapVisible === this.isCapVisible &&
			state.isRingVisible === this.isRingVisible &&
			state.isBaseVisible === this.isBaseVisible &&
			state.isSkirtVisible === this.isSkirtVisible &&
			state.capMaterial === this.capMaterial &&
			state.ringMaterial === this.ringMaterial &&
			state.baseMaterial === this.baseMaterial &&
			state.skirtMaterial === this.skirtMaterial
		)
	}
}

/** Bumper API. @see https://github.com/vpinball/vpinball/blob/master/bumper.cpp */
export class BumperApi extends ItemApi<BumperData> {
	private readonly isBaseDynamic: boolean
	private readonly isCapDynamic: boolean
	private readonly isRingDynamic: boolean
	private readonly isSkirtDynamic: boolean

	constructor(
		private readonly _state: BumperState,
		private readonly animation: BumperAnimation,
		data: BumperData,
		events: EventProxy,
		private readonly hit: HitObject,
		player: Player,
		table: Table,
	) {
		super(data, events, player, table)
		this.isBaseDynamic = !!table.getMaterial(data.szBaseMaterial)?.isOpacityActive
		this.isCapDynamic = !!table.getMaterial(data.szCapMaterial)?.isOpacityActive
		this.isRingDynamic = !!table.getMaterial(data.szRingMaterial)?.isOpacityActive
		this.isSkirtDynamic = !!table.getMaterial(data.szSkirtMaterial)?.isOpacityActive
	}

	get Radius() {
		return this.data.radius
	}
	set Radius(v) {
		this.data.radius = v
	}
	get Force() {
		return this.data.force
	}
	set Force(v) {
		this.data.force = v
	}
	get Scatter() {
		return this.data.scatter
	}
	set Scatter(v) {
		this.data.scatter = v
	}
	get HeightScale() {
		return this.data.heightScale
	}
	set HeightScale(v) {
		this.data.heightScale = v
	}
	get RingSpeed() {
		return this.data.ringSpeed
	}
	set RingSpeed(v) {
		this.data.ringSpeed = v
	}
	get Orientation() {
		return this.data.orientation
	}
	set Orientation(v) {
		this.data.orientation = v
	}
	get RingDropOffset() {
		return this.data.ringDropOffset
	}
	set RingDropOffset(v) {
		this.data.ringDropOffset = v
	}
	get Threshold() {
		return this.data.threshold
	}
	set Threshold(v) {
		this.data.threshold = v
	}
	get X() {
		return this.data.center.x
	}
	set X(v) {
		this.data.center.x = v
	}
	get Y() {
		return this.data.center.y
	}
	set Y(v) {
		this.data.center.y = v
	}
	get Surface() {
		return this.data.szSurface
	}
	set Surface(v) {
		this.data.szSurface = v
	}
	get CapMaterial() {
		return this.data.szCapMaterial
	}
	set CapMaterial(v) {
		if (this.isCapDynamic) this._state.capMaterial = v
		this.data.szCapMaterial = v
	}
	get BaseMaterial() {
		return this.data.szBaseMaterial
	}
	set BaseMaterial(v) {
		if (this.isBaseDynamic) this._state.baseMaterial = v
		this.data.szBaseMaterial = v
	}
	get SkirtMaterial() {
		return this.data.szSkirtMaterial
	}
	set SkirtMaterial(v) {
		if (this.isSkirtDynamic) this._state.skirtMaterial = v
		this.data.szSkirtMaterial = v
	}
	get RingMaterial() {
		return this.data.szRingMaterial
	}
	set RingMaterial(v) {
		if (this.isRingDynamic) this._state.ringMaterial = v
		this.data.szRingMaterial = v
	}
	get HasHitEvent() {
		return this.data.hitEvent
	}
	set HasHitEvent(v) {
		this.data.hitEvent = v
	}
	get Collidable() {
		return this.data.isCollidable
	}
	set Collidable(v) {
		this.data.isCollidable = v
		this.hit.isEnabled = v
	}
	get CapVisible() {
		return this.data.isCapVisible
	}
	set CapVisible(v) {
		if (this.isCapDynamic) this._state.isCapVisible = v
		this.data.isCapVisible = v
	}
	get BaseVisible() {
		return this.data.isBaseVisible
	}
	set BaseVisible(v) {
		if (this.isBaseDynamic) this._state.isBaseVisible = v
		this.data.isBaseVisible = v
	}
	get RingVisible() {
		return this.data.isRingVisible
	}
	set RingVisible(v) {
		if (this.isRingDynamic) this._state.isRingVisible = v
		this.data.isRingVisible = v
	}
	get SkirtVisible() {
		return this.data.isSkirtVisible
	}
	set SkirtVisible(v) {
		if (this.isSkirtDynamic) this._state.isSkirtVisible = v
		this.data.isSkirtVisible = v
	}
	get ReflectionEnabled() {
		return this.data.isReflectionEnabled
	}
	set ReflectionEnabled(v) {
		this.data.isReflectionEnabled = v
	}
	get SkirtAnimation() {
		return this.animation.enableSkirtAnimation
	}
	set SkirtAnimation(v) {
		this.animation.enableSkirtAnimation = v
	}
	get EnableSkirtAnimation() {
		return this.animation.enableSkirtAnimation
	}
	set EnableSkirtAnimation(v) {
		this.animation.enableSkirtAnimation = v
	}

	get CurrentRingOffset() {
		return this._state.ringOffset
	}

	get RotX() {
		return this._state.skirtRotX
	}

	get RotY() {
		return this._state.skirtRotY
	}

	public PlayHit(): void {
		this.animation.hitEvent = true
	}
	public InterfaceSupportsErrorInfo(_riid: unknown): boolean {
		return false
	}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(BumperApi.prototype)
	}
}

/** Bumper item. @see https://github.com/vpinball/vpinball/blob/master/bumper.cpp */
export class Bumper
	extends Item<BumperData>
	implements IRenderable<BumperState>, IHittable, IAnimatable, IScriptable<BumperApi>
{
	private readonly meshGenerator: BumperMeshGenerator
	private readonly state: BumperState
	private readonly updater: BumperUpdater
	private hit?: BumperHit
	private animation?: BumperAnimation
	private api?: BumperApi

	public static async fromStorage(storage: Storage, itemName: string): Promise<Bumper> {
		const data = await BumperData.fromStorage(storage, itemName)
		return new Bumper(data)
	}

	public constructor(data: BumperData) {
		super(data)
		this.state = BumperState.claim(
			this.getName(),
			0,
			0,
			0,
			data.isCapVisible,
			data.isRingVisible,
			data.isBaseVisible,
			data.isSkirtVisible,
			data.szCapMaterial,
			data.szRingMaterial,
			data.szBaseMaterial,
			data.szSkirtMaterial,
		)
		this.meshGenerator = new BumperMeshGenerator(data)
		this.updater = new BumperUpdater(this.state, this.data)
	}

	public isCollidable(): boolean {
		return this.data.isCollidable
	}

	public getMeshes<GEOMETRY>(table: Table): Meshes<GEOMETRY> {
		const m = this.meshGenerator.getMeshes(table)
		const mat = (name?: string) => table.getMaterial(name)
		return {
			base: {
				isVisible: this.data.isBaseVisible,
				mesh: m.base.transform(Matrix3D.RIGHT_HANDED),
				material: mat(this.data.szBaseMaterial),
				map: Texture.fromFilesystem('bumperbase.png'),
			},
			ring: {
				isVisible: this.data.isRingVisible,
				mesh: m.ring.transform(Matrix3D.RIGHT_HANDED),
				material: mat(this.data.szRingMaterial),
				map: Texture.fromFilesystem('bumperring.png'),
			},
			skirt: {
				isVisible: this.data.isSkirtVisible,
				mesh: m.skirt.transform(Matrix3D.RIGHT_HANDED),
				material: mat(this.data.szSkirtMaterial),
				map: Texture.fromFilesystem('bumperskirt.png'),
			},
			cap: {
				isVisible: this.data.isCapVisible,
				mesh: m.cap.transform(Matrix3D.RIGHT_HANDED),
				material: mat(this.data.szCapMaterial),
				map: Texture.fromFilesystem('bumperCap.png'),
			},
		}
	}

	public setupPlayer(player: Player, table: Table): void {
		this.events = new EventProxy(this)
		this.animation = new BumperAnimation(this.data, this.state, this.events)
		const height = table.getSurfaceHeight(this.data.szSurface, this.data.center.x, this.data.center.y)
		this.hit = new BumperHit(this.data, this.state, this.animation, this.events, height)
		this.api = new BumperApi(this.state, this.animation, this.data, this.events, this.hit, player, table)
	}

	public getApi(): BumperApi {
		return this.api!
	}

	public getEventNames(): string[] {
		return ['Animate', 'Hit', 'Init', 'Timer']
	}

	public getHitShapes(): HitObject[] {
		return [this.hit!]
	}

	public getAnimation(): BumperAnimation {
		return this.animation!
	}

	public getState(): BumperState {
		return this.state
	}

	public getUpdater(): BumperUpdater {
		return this.updater
	}
}
