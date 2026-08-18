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
import { omitEqual } from '../state-helpers.js'
import type { Table } from '../table/table.js'
import { RubberHitGenerator } from './rubber-physics.js'
import { RubberMeshGenerator, RubberUpdater } from './rubber-view.js'

const FLOAT_MAP: Record<string, string> = {
	HTTP: 'height',
	HTHI: 'hitHeight',
	ELAS: 'elasticity',
	ELFO: 'elasticityFalloff',
	RFCT: 'friction',
	RSCT: 'scatter',
	ROTX: 'rotX',
	ROTY: 'rotY',
	ROTZ: 'rotZ',
}
const INT_MAP: Record<string, string> = { WDTP: 'thickness' }
const BOOL_MAP: Record<string, string> = {
	HTEV: 'hitEvent',
	CLDR: 'isCollidable',
	RVIS: 'isVisible',
	REEN: 'isReflectionEnabled',
	ESTR: 'staticRendering',
	ESIE: 'showInEditor',
	OVPH: 'overwritePhysics',
}
const STRING_MAP: Record<string, string> = { MATR: 'szMaterial', IMAG: 'szImage', MAPH: 'szPhysicsMaterial' }

/** Rubber data.
 * @see https://github.com/vpinball/vpinball/blob/master/rubber.cpp */
export class RubberData extends ItemData implements IPhysicalData {
	public height: number = 25
	public hitHeight: number = 25
	public thickness: number = 8
	public hitEvent = false
	public szMaterial?: string
	public szImage?: string
	public elasticity = 0.8
	public elasticityFalloff = 0.3
	public friction = 0.6
	public scatter = 5
	public isCollidable = true
	public isVisible = true
	public isReflectionEnabled = true
	public staticRendering = true
	public showInEditor = false
	public rotX = 0
	public rotY = 0
	public rotZ = 0
	public szPhysicsMaterial?: string
	public overwritePhysics = false
	public dragPoints: DragPoint[] = []

	public static async fromStorage(storage: Storage, itemName: string): Promise<RubberData> {
		const d = new RubberData(itemName)
		await storage.streamFiltered(itemName, 4, RubberData.createStreamHandler(d))
		return d
	}

	private static createStreamHandler(d: RubberData) {
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
		if (tag === 'PNTS') return 0
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

/** Rubber state. @see https://github.com/vpinball/vpinball/blob/master/rubber.cpp */
export class RubberState extends ItemState {
	public height!: number
	public rotX!: number
	public rotY!: number
	public rotZ!: number
	public material?: string
	public texture?: string

	public static claim(
		name: string,
		height: number,
		rotX: number,
		rotY: number,
		rotZ: number,
		material: string | undefined,
		texture: string | undefined,
		isVisible: boolean,
	): RubberState {
		const state = new RubberState()
		state.name = name
		state.height = height
		state.rotX = rotX
		state.rotY = rotY
		state.rotZ = rotZ
		state.material = material
		state.texture = texture
		state.isVisible = isVisible
		return state
	}

	public clone(): RubberState {
		return RubberState.claim(
			this.name,
			this.height,
			this.rotX,
			this.rotY,
			this.rotZ,
			this.material,
			this.texture,
			this.isVisible,
		)
	}

	public diff(state: RubberState): RubberState {
		const d = this.clone()
		omitEqual(d, state, 'height')
		omitEqual(d, state, 'rotX')
		omitEqual(d, state, 'rotY')
		omitEqual(d, state, 'rotZ')
		omitEqual(d, state, 'material')
		omitEqual(d, state, 'texture')
		omitEqual(d, state, 'isVisible')
		return d
	}

	public release(): void {}

	public equals(state: RubberState): boolean {
		if (!state) return false
		return (
			state.height === this.height &&
			state.rotX === this.rotX &&
			state.rotY === this.rotY &&
			state.rotZ === this.rotZ &&
			state.material === this.material &&
			state.texture === this.texture &&
			state.isVisible === this.isVisible
		)
	}
}

/** Rubber API — VBS surface for `Rubber`. @see https://github.com/vpinball/vpinball/blob/master/rubber.cpp */
export class RubberApi extends ItemApi<RubberData> {
	constructor(
		private readonly _state: RubberState,
		private readonly hits: HitObject[],
		data: RubberData,
		events: EventProxy,
		player: Player,
		table: Table,
	) {
		super(data, events, player, table)
	}

	get Height() {
		return this._state.height ?? this.data.height
	}
	set Height(v) {
		this._state.height = v
		this.data.height = v
	}
	get HitHeight() {
		return this.data.hitHeight
	}
	set HitHeight(v) {
		this.data.hitHeight = v
	}
	get Thickness() {
		return this.data.thickness
	}
	set Thickness(v) {
		this.data.thickness = v
	}
	get Material() {
		return this._state.material ?? this.data.szMaterial ?? ''
	}
	set Material(v) {
		this._state.material = v
		this.data.szMaterial = v
	}
	get Image() {
		return this._state.texture ?? this.data.szImage ?? ''
	}
	set Image(v) {
		this._assertNonHdrImage(v)
		this._state.texture = v
		this.data.szImage = v
	}
	get HasHitEvent() {
		return this.data.hitEvent
	}
	set HasHitEvent(v) {
		this.data.hitEvent = v
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
		this.data.friction = v
	}
	get Scatter() {
		return this.data.scatter
	}
	set Scatter(v) {
		this.data.scatter = v
	}
	get Collidable() {
		return this.hits[0]?.isEnabled ?? false
	}
	set Collidable(v) {
		if (v !== this.Collidable) for (const hit of this.hits) hit.isEnabled = v
	}
	get Visible() {
		return this._state.isVisible
	}
	set Visible(v) {
		this._state.isVisible = !!v
		this.data.isVisible = !!v
	}
	get EnableStaticRendering() {
		return this.data.staticRendering
	}
	set EnableStaticRendering(v) {
		this.data.staticRendering = v
	}
	get EnableShowInEditor() {
		return this.data.showInEditor
	}
	set EnableShowInEditor(v) {
		this.data.showInEditor = v
	}
	get ReflectionEnabled() {
		return this.data.isReflectionEnabled
	}
	set ReflectionEnabled(v) {
		this.data.isReflectionEnabled = v
	}
	get RotX() {
		return this._state.rotX
	}
	set RotX(v) {
		this._state.rotX = v
		this.data.rotX = v
	}
	get RotY() {
		return this._state.rotY
	}
	set RotY(v) {
		this._state.rotY = v
		this.data.rotY = v
	}
	get RotZ() {
		return this._state.rotZ
	}
	set RotZ(v) {
		this._state.rotZ = v
		this.data.rotZ = v
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
		return Object.getOwnPropertyNames(RubberApi.prototype)
	}
}

/** Rubber item. @see https://github.com/vpinball/vpinball/blob/master/rubber.cpp */
export class Rubber extends Item<RubberData> implements IRenderable<RubberState>, IHittable, IScriptable<RubberApi> {
	private readonly state: RubberState
	private readonly meshGenerator: RubberMeshGenerator
	private readonly updater: RubberUpdater
	private hitGenerator: RubberHitGenerator
	private hits: HitObject[] = []
	private api!: RubberApi

	public static async fromStorage(storage: Storage, itemName: string): Promise<Rubber> {
		const data = await RubberData.fromStorage(storage, itemName)
		return new Rubber(data)
	}

	public constructor(data: RubberData) {
		super(data)
		this.state = RubberState.claim(
			data.getName(),
			data.height,
			data.rotX,
			data.rotY,
			data.rotZ,
			data.szMaterial,
			data.szImage,
			data.isVisible,
		)
		this.meshGenerator = new RubberMeshGenerator(data)
		this.hitGenerator = new RubberHitGenerator(data, this.meshGenerator)
		this.updater = new RubberUpdater(this.data, this.state, this.meshGenerator.middlePoint)
	}

	public isCollidable(): boolean {
		return this.data.isCollidable
	}

	public getMeshes<GEOMETRY>(table: Table): Meshes<GEOMETRY> {
		const mesh = this.meshGenerator.getMeshes(table)
		return {
			rubber: {
				isVisible: this.data.isVisible,
				mesh: mesh.transform(Matrix3D.RIGHT_HANDED),
				map: table.getTexture(this.data.szImage),
				material: table.getMaterial(this.data.szMaterial),
			},
		}
	}

	public setupPlayer(player: Player, table: Table): void {
		this.events = new EventProxy(this)
		this.hits = this.hitGenerator.generateHitObjects(this.events, table)
		this.api = new RubberApi(this.state, this.hits, this.data, this.events, player, table)
	}

	public getApi(): RubberApi {
		return this.api!
	}

	public getHitShapes(): HitObject[] {
		return this.hits
	}

	public getEventNames(): string[] {
		return ['Hit', 'Init', 'Timer']
	}

	public getState(): RubberState {
		return this.state
	}

	public getUpdater(): RubberUpdater {
		return this.updater
	}
}
