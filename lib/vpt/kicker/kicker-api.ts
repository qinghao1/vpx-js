// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { EventProxy } from '../../game/event-proxy.js'
import type { IBallCreationPosition, Player } from '../../game/player.js'
import { Vertex3D } from '../../math/vertex3d.js'
import { logger } from '../../util/logger.js'
import type { Ball } from '../ball/ball.js'
import { ItemApi } from '../item-api.js'
import type { Table } from '../table/table.js'
import type { KickerData } from './kicker-data.js'
import type { KickerHit } from './kicker-hit.js'
import type { KickerState } from './kicker-state.js'

/** Kicker API. */
export class KickerApi extends ItemApi<KickerData> {
	private readonly state: KickerState
	private readonly hit: KickerHit
	private readonly ballCreator: IBallCreationPosition

	constructor(
		state: KickerState,
		data: KickerData,
		hit: KickerHit,
		events: EventProxy,
		ballCreator: IBallCreationPosition,
		player: Player,
		table: Table,
	) {
		super(data, events, player, table)
		this.state = state
		this.hit = hit
		this.ballCreator = ballCreator
	}

	/** Get X. */
	get X() {
		return this.data.center.x
	}
	set X(v) {
		this.data.center.x = v
	}
	/** Get Y. */
	get Y() {
		return this.data.center.y
	}
	set Y(v) {
		this.data.center.y = v
	}
	/** Get Surface. */
	get Surface() {
		return this.data.szSurface
	}
	set Surface(v) {
		this.data.szSurface = v
	}
	/** Get Enabled. */
	get Enabled() {
		return this.hit.isEnabled
	}
	set Enabled(v) {
		this.hit.isEnabled = v
	}
	/** Get Scatter. */
	get Scatter() {
		return this.data.scatter
	}
	set Scatter(v) {
		this.data.scatter = v
	}
	/** Get HitAccuracy. */
	get HitAccuracy() {
		return this.data.hitAccuracy
	}
	set HitAccuracy(v) {
		this.data.hitAccuracy = v
	}
	/** Get HitHeight. */
	get HitHeight() {
		return this.data.hitHeight
	}
	set HitHeight(v) {
		this.data.hitHeight = v
	}
	/** Get Orientation. */
	get Orientation() {
		return this.data.orientation
	}
	set Orientation(v) {
		this.data.orientation = v
	}
	/** Get Radius. */
	get Radius() {
		return this.data.radius
	}
	set Radius(v) {
		this.data.radius = v
	}
	/** Get FallThrough. */
	get FallThrough() {
		return this.data.fallThrough
	}
	set FallThrough(v) {
		this.data.fallThrough = v
	}
	/** Get Legacy. */
	get Legacy() {
		return this.data.legacyMode
	}
	set Legacy(v) {
		this.data.legacyMode = v
	}
	/** Get DrawStyle. */
	get DrawStyle() {
		return this.state.type
	}
	set DrawStyle(v) {
		this.state.type = v
	}
	/** Get Material. */
	get Material() {
		return this.state.material
	}
	set Material(v) {
		this.state.material = v
	}

	get LastCapturedBall(): Ball | null {
		if (!this.hit.lastCapturedBall) {
			logger().error('LastCapturedBall was called but no ball was captured!')
			return null
		}

		let ballFound = false
		for (const ball of this.player.balls) {
			if (ball === this.hit.lastCapturedBall) {
				ballFound = true
				break
			}
		}

		if (!ballFound) {
			logger().error('LastCapturedBall was called but ball is already destroyed!')
			return null
		}

		return this.hit.lastCapturedBall // todo need to return the *api* of the ball (currently non-existent)
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

	public KickXYZ(angle: number, speed: number, inclination: number, x: number, y: number, z: number) {
		this.hit.kickXyz(this.table, this.player.getPhysics(), angle, speed, inclination, new Vertex3D(x, y, z))
	}

	public KickZ(angle: number, speed: number, inclination: number, heightZ: number) {
		this.hit.kickXyz(this.table, this.player.getPhysics(), angle, speed, inclination, new Vertex3D(0, 0, heightZ))
	}

	public Kick(angle: number, speed: number, inclination: number = 0): void {
		this.hit.kickXyz(this.table, this.player.getPhysics(), angle, speed, inclination, new Vertex3D(0, 0, 0))
	}

	public _ballCountOver(): number {
		return super._ballCountOver(this.events)
	}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(KickerApi.prototype)
	}
}
