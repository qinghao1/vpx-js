// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EventProxy } from '../../game/event-proxy.js'
import type { IHittable } from '../../game/ihittable.js'
import type { IRenderable, Meshes } from '../../game/irenderable.js'
import type { IScriptable } from '../../game/iscriptable.js'
import type { IBallCreationPosition, Player } from '../../game/player.js'
import type { PlayerPhysics } from '../../game/player-physics.js'
import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import type { HitObject } from '../../physics/hit-object.js'
import { logger } from '../../util/logger.js'
import { Matrix3D } from '../../util/matrix.js'
import { Vertex2D, Vertex3D } from '../../util/vector.js'
import type { Ball } from '../ball/ball.js'
import { handleBiffTag } from '../biff-helper.js'
import { Enums } from '../enums.js'
import { Item } from '../item.js'
import { ItemApi } from '../item-api.js'
import { ItemData } from '../item-data.js'
import { ItemState } from '../item-state.js'
import type { Table } from '../table/table.js'
import { Texture } from '../texture.js'
import { KickerHit } from './kicker-physics.js'
import { KickerMeshGenerator, KickerUpdater } from './kicker-view.js'

const FLOAT_MAP: Record<string, string> = {
	RADI: 'radius',
	KSCT: 'scatter',
	KHAC: 'hitAccuracy',
	KHHI: 'hitHeight',
	KORI: 'orientation',
}
const BOOL_MAP: Record<string, string> = { EBLD: 'isEnabled', FATH: 'fallThrough', LEMO: 'legacyMode' }
const STRING_MAP: Record<string, string> = { MATR: 'szMaterial', SURF: 'szSurface' }

/** Kicker data. @see https://github.com/vpinball/vpinball/blob/master/kicker.cpp */
export class KickerData extends ItemData {
	public kickerType: number = Enums.KickerType.KickerHole
	public center!: Vertex2D
	public radius = 25
	public scatter = 0
	public hitAccuracy = 0.5
	public hitHeight = 35
	public orientation = 0
	public szMaterial?: string
	public szSurface?: string
	public fallThrough = false
	public isEnabled = true
	public legacyMode = true

	public static async fromStorage(storage: Storage, itemName: string): Promise<KickerData> {
		const d = new KickerData(itemName)
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
		if (tag === 'TYPE') {
			this.kickerType = this.getInt(buffer)
			if (this.kickerType > Enums.KickerType.KickerCup2) this.kickerType = Enums.KickerType.KickerInvisible
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

/** Kicker state — type and material.
 * @see https://github.com/vpinball/vpinball/blob/master/kicker.cpp */
export class KickerState extends ItemState {
	public type!: number
	public material?: string

	// @ts-expect-error — derived visibility from type
	get isVisible(): boolean {
		return this.type !== Enums.KickerType.KickerInvisible
	}
	set isVisible(_v: boolean) {}

	public static claim(name: string, type: number, material: string | undefined): KickerState {
		const s = new KickerState()
		s.name = name
		s.type = type
		s.material = material
		return s
	}
}

/** Kicker API — VBS surface for `Kicker`. @see https://github.com/vpinball/vpinball/blob/master/kicker.cpp */
export class KickerApi extends ItemApi<KickerData> {
	constructor(
		private readonly _state: KickerState,
		data: KickerData,
		private readonly hit: KickerHit,
		events: EventProxy,
		private readonly ballCreator: IBallCreationPosition,
		player: Player,
		table: Table,
	) {
		super(data, events, player, table)
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
	get Enabled() {
		return this.hit.isEnabled
	}
	set Enabled(v) {
		this.hit.isEnabled = v
	}
	get Scatter() {
		return this.data.scatter
	}
	set Scatter(v) {
		this.data.scatter = v
	}
	get HitAccuracy() {
		return this.data.hitAccuracy
	}
	set HitAccuracy(v) {
		this.data.hitAccuracy = v
	}
	get HitHeight() {
		return this.data.hitHeight
	}
	set HitHeight(v) {
		this.data.hitHeight = v
	}
	get Orientation() {
		return this.data.orientation
	}
	set Orientation(v) {
		this.data.orientation = v
	}
	get Radius() {
		return this.data.radius
	}
	set Radius(v) {
		this.data.radius = v
	}
	get FallThrough() {
		return this.data.fallThrough
	}
	set FallThrough(v) {
		this.data.fallThrough = v
	}
	get Legacy() {
		return this.data.legacyMode
	}
	set Legacy(v) {
		this.data.legacyMode = v
	}
	get KickerType() {
		return this._state.type
	}
	set KickerType(v) {
		this._state.type = v
	}
	get Material() {
		return this._state.material
	}
	set Material(v) {
		this._state.material = v
	}
	get DrawStyle() {
		return this._state.type
	}
	set DrawStyle(v) {
		this._state.type = v
	}

	get LastCapturedBall(): Ball | null {
		if (!this.hit.lastCapturedBall) return null
		let ballFound = false
		for (const ball of this.player.getBalls()) {
			if (ball === this.hit.lastCapturedBall) {
				ballFound = true
				break
			}
		}
		if (!ballFound) {
			logger().error('LastCapturedBall was called but ball is already destroyed!')
			return null
		}
		return this.hit.lastCapturedBall
	}

	public CreateSizedBallWithMass(radius: number, mass: number): Ball {
		return this.player.createBall(this.ballCreator, radius, mass)
	}

	public CreateSizedBall(radius: number): Ball {
		return this.player.createBall(this.ballCreator, radius)
	}

	public CreateBall(): Ball {
		return this.player.createBall(this.ballCreator)
	}

	public DestroyBall(): number {
		let cnt = 0
		if (this.hit.ball) {
			++cnt
			const b = this.hit.ball
			this.hit.ball = undefined
			this.player.destroyBall(b)
		}
		return cnt
	}

	public KickXYZ(angle: number, speed: number, inclination: number, x: number, y: number, z: number): void {
		this.hit.kickXyz(this.table, this.player.getPhysics(), angle, speed, inclination, new Vertex3D(x, y, z))
	}

	public KickZ(angle: number, speed: number, inclination: number, heightZ: number): void {
		this.hit.kickXyz(this.table, this.player.getPhysics(), angle, speed, inclination, new Vertex3D(0, 0, heightZ))
	}

	public Kick(angle: number, speed: number, inclination = 0): void {
		this.hit.kickXyz(this.table, this.player.getPhysics(), angle, speed, inclination, new Vertex3D(0, 0, 0))
	}

	get BallCntOver(): number {
		return super._ballCountOver(this.events)
	}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(KickerApi.prototype)
	}
}

/** Kicker item. @see https://github.com/vpinball/vpinball/blob/master/kicker.cpp */
export class Kicker
	extends Item<KickerData>
	implements IRenderable<KickerState>, IHittable, IBallCreationPosition, IScriptable<KickerApi>
{
	private readonly meshGenerator: KickerMeshGenerator
	private readonly state: KickerState
	private readonly updater: KickerUpdater
	private hit?: KickerHit
	private api?: KickerApi

	public static async fromStorage(storage: Storage, itemName: string): Promise<Kicker> {
		const data = await KickerData.fromStorage(storage, itemName)
		return new Kicker(data)
	}

	public constructor(data: KickerData) {
		super(data)
		this.state = KickerState.claim(data.getName(), data.kickerType, data.szMaterial)
		this.meshGenerator = new KickerMeshGenerator(data)
		this.updater = new KickerUpdater(this.state)
	}

	public isCollidable(): boolean {
		return true
	}

	public getMeshes<GEOMETRY>(table: Table): Meshes<GEOMETRY> {
		return {
			kicker: {
				isVisible: this.data.kickerType !== Enums.KickerType.KickerInvisible,
				mesh: this.meshGenerator.getMesh(table).transform(Matrix3D.RIGHT_HANDED),
				material: table.getMaterial(this.data.szMaterial),
				map: this.getTexture(),
			},
		}
	}

	public getBallCreationPosition(table: Table): Vertex3D {
		const height = table.getSurfaceHeight(this.data.szSurface, this.data.center.x, this.data.center.y)
		return new Vertex3D(this.data.center.x, this.data.center.y, (height + 25) * table.getScaleZ())
	}

	public getBallCreationVelocity(_table: Table): Vertex3D {
		return new Vertex3D()
	}

	public onBallCreated(physics: PlayerPhysics, ball: Ball): void {
		this.hit?.doCollide(physics, ball, new Vertex3D(0, 0, 1), false, true)
	}

	public setupPlayer(player: Player, table: Table): void {
		this.events = new EventProxy(this)
		const height =
			table.getSurfaceHeight(this.data.szSurface, this.data.center.x, this.data.center.y) * table.getScaleZ()
		this.hit = new KickerHit(this.data, this.events, table, this.data.radius, height)
		this.api = new KickerApi(this.state, this.data, this.hit, this.events, this, player, table)
	}

	public getApi(): KickerApi {
		return this.api!
	}

	public getEventNames(): string[] {
		return ['Hit', 'Init', 'Timer', 'Unhit']
	}

	public getHitShapes(): HitObject[] {
		return [this.hit!]
	}

	public getState(): KickerState {
		return this.state
	}

	public getUpdater(): KickerUpdater {
		return this.updater
	}

	public getHit(): KickerHit {
		return this.hit!
	}

	private getTexture(): Texture {
		switch (this.data.kickerType) {
			case Enums.KickerType.KickerCup:
				return Texture.fromFilesystem('kickerCup.png')
			case Enums.KickerType.KickerWilliams:
				return Texture.fromFilesystem('kickerWilliams.png')
			case Enums.KickerType.KickerGottlieb:
				return Texture.fromFilesystem('kickerGottlieb.png')
			case Enums.KickerType.KickerCup2:
				return Texture.fromFilesystem('kickerT1.png')
			case Enums.KickerType.KickerHole:
				return Texture.fromFilesystem('kickerHoleWood.png')
			default:
				return Texture.fromFilesystem('kickerHoleWood.png')
		}
	}
}
