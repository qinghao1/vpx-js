// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { EventProxy } from '../../game/event-proxy.js'
import type { Player } from '../../game/player.js'
import { ItemApi } from '../item-api.js'
import type { Table } from '../table/table.js'
import type { Ball } from './ball.js'
import type { BallData } from './ball-data.js'
import type { BallHit } from './ball-hit.js'
import type { BallState } from './ball-state.js'

/** VBS API for Ball.
 *
 * @see https://github.com/vpinball/vpinball/blob/master/ball.cpp */
export class BallApi extends ItemApi<BallData> {
	private readonly ball: Ball
	private readonly state: BallState
	private readonly hit: BallHit

	constructor(
		ball: Ball,
		state: BallState,
		hit: BallHit,
		data: BallData,
		events: EventProxy,
		player: Player,
		table: Table,
	) {
		super(data, events, player, table)
		this.ball = ball
		this.state = state
		this.hit = hit
	}

	/** Get X. */
	get X() {
		return this.state.pos.x
	}
	set X(v) {
		this.state.pos.x = v
	}
	/** Get Y. */
	get Y() {
		return this.state.pos.y
	}
	set Y(v) {
		this.state.pos.y = v
	}
	/** Get Z. */
	get Z() {
		return this.state.pos.z
	}
	set Z(v) {
		this.state.pos.z = v
	}
	/** Get VelX. */
	get VelX() {
		return this.hit.vel.x
	}
	set VelX(v) {
		this.hit.vel.x = v
		this.hit.calcHitBBox()
	}
	/** Get VelY. */
	get VelY() {
		return this.hit.vel.y
	}
	set VelY(v) {
		this.hit.vel.y = v
		this.hit.calcHitBBox()
	}
	/** Get VelZ. */
	get VelZ() {
		return this.hit.vel.z
	}
	set VelZ(v) {
		this.hit.vel.z = v
		this.hit.calcHitBBox()
	}
	/** Get AngVelX. */
	get AngVelX() {
		return this.hit.angularVelocity.x
	}
	set AngVelX(v) {
		this.hit.angularVelocity.x = v
		this.hit.calcHitBBox()
	}
	/** Get AngVelY. */
	get AngVelY() {
		return this.hit.angularVelocity.y
	}
	set AngVelY(v) {
		this.hit.angularVelocity.y = v
		this.hit.calcHitBBox()
	}
	/** Get AngVelZ. */
	get AngVelZ() {
		return this.hit.angularVelocity.z
	}
	set AngVelZ(v) {
		this.hit.angularVelocity.z = v
		this.hit.calcHitBBox()
	}
	/** Get AngMomX. */
	get AngMomX() {
		return this.hit.angularMomentum.x
	}
	set AngMomX(v) {
		this.hit.angularMomentum.x = v
		this.hit.calcHitBBox()
	}
	/** Get AngMomY. */
	get AngMomY() {
		return this.hit.angularMomentum.y
	}
	set AngMomY(v) {
		this.hit.angularMomentum.y = v
		this.hit.calcHitBBox()
	}
	/** Get AngMomZ. */
	get AngMomZ() {
		return this.hit.angularMomentum.z
	}
	set AngMomZ(v) {
		this.hit.angularMomentum.z = v
		this.hit.calcHitBBox()
	}
	/** Get Color. */
	get Color() {
		return this.data.color
	}
	set Color(v) {
		this.data.color = v
	}
	/** Get Image. */
	get Image() {
		return this.data.environmentMap
	}
	set Image(v) {
		this.data.environmentMap = v
	}
	/** Get FrontDecal. */
	get FrontDecal() {
		return this.data.frontDecal
	}
	set FrontDecal(v) {
		this._assertNonHdrImage(v)
		this.data.frontDecal = v
	}
	/** Get DecalMode. */
	get DecalMode() {
		return this.data.decalMode
	}
	set DecalMode(v) {
		this.data.decalMode = v
	}
	/** Get Mass. */
	get Mass() {
		return this.data.mass
	}
	set Mass(v) {
		this.hit.setMass(v)
	}
	/** Get ID. */
	get ID() {
		return this.ball.id
	}
	set ID(v) {
		this.ball.id = v
	}
	/** Get Radius. */
	get Radius() {
		return this.data.radius
	}
	set Radius(v) {
		this.hit.setRadius(v)
	}
	/** Get BulbIntensityScale. */
	get BulbIntensityScale() {
		return this.data.bulbIntensityScale
	}
	set BulbIntensityScale(v) {
		this.data.bulbIntensityScale = v
	}
	/** Get ReflectionEnabled. */
	get ReflectionEnabled() {
		return this.data.isReflectionEnabled
	}
	set ReflectionEnabled(v) {
		this.data.isReflectionEnabled = v
	}
	/** Get PlayfieldReflectionScale. */
	get PlayfieldReflectionScale() {
		return this.data.playfieldReflectionStrength
	}
	set PlayfieldReflectionScale(v) {
		this.data.playfieldReflectionStrength = v
	}
	/** Get ForceReflection. */
	get ForceReflection() {
		return this.data.forceReflection
	}
	set ForceReflection(v) {
		this.data.forceReflection = v
	}
	/** Get Visible. */
	get Visible() {
		return this.hit.isVisible
	}
	set Visible(v) {
		this.hit.isVisible = v
	}

	public DestroyBall(): number {
		this.player.destroyBall(this.ball)
		return 1
	}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(BallApi.prototype)
	}
}
