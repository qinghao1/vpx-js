// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { EventProxy } from '../../game/event-proxy.js'
import type { Player } from '../../game/player.js'
import type { PlayerPhysics } from '../../game/player-physics.js'
import { clamp } from '../../math/functions.js'
import type { HitObject } from '../../physics/hit-object.js'
import { ItemApi } from '../item-api.js'
import type { Table } from '../table/table.js'
import { HitTarget } from './hit-target.js'
import type { HitTargetAnimation } from './hit-target-animation.js'
import type { HitTargetData } from './hit-target-data.js'
import type { HitTargetState } from './hit-target-state.js'

/** Hit target API.
 *
 * @see https://github.com/vpinball/vpinball/blob/master/hittarget.cpp */
export class HitTargetApi extends ItemApi<HitTargetData> {
	private readonly state: HitTargetState
	private readonly hits: HitObject[]
	private readonly animation: HitTargetAnimation

	constructor(
		state: HitTargetState,
		data: HitTargetData,
		hits: HitObject[],
		animation: HitTargetAnimation,
		events: EventProxy,
		player: Player,
		table: Table,
	) {
		super(data, events, player, table)
		this.state = state
		this.hits = hits
		this.animation = animation
	}

	/** Get Image. */
	get Image() {
		return this.state.texture
	}
	set Image(v) {
		this._assertNonHdrImage(v)
		this.state.texture = v
	}
	/** Get Material. */
	get Material() {
		return this.state.material
	}
	set Material(v) {
		this.state.material = v
	}
	/** Get Visible. */
	get Visible() {
		return this.state.isVisible
	}
	set Visible(v) {
		this.state.isVisible = v
	}
	/** Get X. */
	get X() {
		return this.data.position.x
	}
	set X(v) {
		this.data.position.x = v
	}
	/** Get Y. */
	get Y() {
		return this.data.position.y
	}
	set Y(v) {
		this.data.position.y = v
	}
	/** Get Z. */
	get Z() {
		return this.data.position.z
	}
	set Z(v) {
		this.data.position.z = v
	}
	/** Get ScaleX. */
	get ScaleX() {
		return this.data.vSize.x
	}
	set ScaleX(v) {
		this.data.vSize.x = v
	}
	/** Get ScaleY. */
	get ScaleY() {
		return this.data.vSize.y
	}
	set ScaleY(v) {
		this.data.vSize.y = v
	}
	/** Get ScaleZ. */
	get ScaleZ() {
		return this.data.vSize.z
	}
	set ScaleZ(v) {
		this.data.vSize.z = v
	}
	/** Get Orientation. */
	get Orientation() {
		return this.data.rotZ
	}
	set Orientation(v) {
		this.data.rotZ = v
	}
	/** Get HasHitEvent. */
	get HasHitEvent() {
		return this.data.useHitEvent
	}
	set HasHitEvent(v) {
		this.data.useHitEvent = v
	}
	/** Get Threshold. */
	get Threshold() {
		return this.data.threshold
	}
	set Threshold(v) {
		this.data.threshold = v
	}
	/** Get Elasticity. */
	get Elasticity() {
		return this.data.elasticity
	}
	set Elasticity(v) {
		this.data.elasticity = v
	}
	/** Get ElasticityFalloff. */
	get ElasticityFalloff() {
		return this.data.elasticityFalloff
	}
	set ElasticityFalloff(v) {
		this.data.elasticityFalloff = v
	}
	/** Get Friction. */
	get Friction() {
		return this.data.friction
	}
	set Friction(v) {
		this.data.friction = clamp(v, 0, 1)
	}
	/** Get Scatter. */
	get Scatter() {
		return this.data.scatter
	}
	set Scatter(v) {
		this.data.scatter = v
	}
	/** Get Collidable. */
	get Collidable() {
		return this.data.isCollidable
	}
	set Collidable(v) {
		this._setCollidable(v)
	}
	/** Get DisableLighting. */
	get DisableLighting() {
		return !!this.data.disableLightingTop
	}
	set DisableLighting(v) {
		this.data.disableLightingTop = v ? 1 : 0
	}
	/** Get BlendDisableLighting. */
	get BlendDisableLighting() {
		return this.data.disableLightingTop
	}
	set BlendDisableLighting(v) {
		this.data.disableLightingTop = v
	}
	/** Get BlendDisableLightingFromBelow. */
	get BlendDisableLightingFromBelow() {
		return this.data.disableLightingBelow
	}
	set BlendDisableLightingFromBelow(v) {
		this.data.disableLightingBelow = v
	}
	/** Get ReflectionEnabled. */
	get ReflectionEnabled() {
		return this.data.isReflectionEnabled
	}
	set ReflectionEnabled(v) {
		this.data.isReflectionEnabled = v
	}
	/** Get DropSpeed. */
	get DropSpeed() {
		return this.data.dropSpeed
	}
	set DropSpeed(v) {
		this.data.dropSpeed = v
	}
	/** Get IsDropped. */
	get IsDropped() {
		return this.data.isDropped
	}
	set IsDropped(v) {
		this._setDropped(v, this.table, this.player.getPhysics())
	}
	/** Get LegacyMode. */
	get LegacyMode() {
		return this.data.legacy
	}
	set LegacyMode(v) {
		this.data.legacy = v
	}
	/** Get DrawStyle. */
	get DrawStyle() {
		return this.data.targetType
	}
	set DrawStyle(v) {
		this.data.targetType = v
	}
	/** Get PhysicsMaterial. */
	get PhysicsMaterial() {
		return this.data.szPhysicsMaterial
	}
	set PhysicsMaterial(v) {
		this.data.szPhysicsMaterial = v
	}
	/** Get OverwritePhysics. */
	get OverwritePhysics() {
		return this.data.overwritePhysics
	}
	set OverwritePhysics(v) {
		this.data.overwritePhysics = v
	}
	/** Get DepthBias. */
	get DepthBias() {
		return this.data.depthBias
	}
	set DepthBias(v) {
		this.data.depthBias = v
	}
	/** Get HitThreshold. */
	get HitThreshold() {
		return this.events.currentHitThreshold
	}
	/** Get RaiseDelay. */
	get RaiseDelay() {
		return this.data.raiseDelay
	}
	set RaiseDelay(v) {
		this.data.raiseDelay = v
	}

	private _setCollidable(isCollidable: boolean) {
		if (this.hits && this.hits.length > 0 && this.hits[0].isEnabled !== isCollidable) {
			for (const hit of this.hits) {
				// !! costly
				hit.isEnabled = isCollidable // copy to hit checking on enities composing the object
			}
		}
		this.data.isCollidable = isCollidable
	}

	private _setDropped(val: boolean, table: Table, physics: PlayerPhysics) {
		if (this.data.isDropped !== val && this.animation) {
			if (val) {
				this.animation.moveAnimation = true
				this.state.zOffset = 0.0
				this.animation.moveDown = true
			} else {
				this.animation.moveAnimation = true
				this.state.zOffset = -HitTarget.DROP_TARGET_LIMIT * table.getScaleZ()
				this.animation.moveDown = false
				this.animation.timeStamp = physics.timeMsec
			}
		} else {
			this.data.isDropped = val
		}
	}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(HitTargetApi.prototype)
	}
}
