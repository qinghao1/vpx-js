// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { EventProxy } from '../../game/event-proxy.js'
import type { Player } from '../../game/player.js'
import type { HitObject } from '../../physics/hit-object.js'
import { ItemApi } from '../item-api.js'
import type { Table } from '../table/table.js'
import type { RampData } from './ramp-data.js'
import type { RampState } from './ramp-state.js'

/** Ramp API. */
export class RampApi extends ItemApi<RampData> {
	private readonly hits: HitObject[]
	private readonly state: RampState
	private readonly isDynamic: boolean

	constructor(state: RampState, hits: HitObject[], data: RampData, events: EventProxy, player: Player, table: Table) {
		super(data, events, player, table)
		this.hits = hits
		this.state = state
		const material = table.getMaterial(data.szMaterial)
		this.isDynamic = !!material && material.isOpacityActive
	}

	/** Get HeightBottom. */
	get HeightBottom() {
		return this.data.heightBottom
	}
	set HeightBottom(v) {
		if (this.isDynamic) {
			this.state.heightBottom = v
		}
		this.data.heightBottom = v
	}
	/** Get HeightTop. */
	get HeightTop() {
		return this.data.heightTop
	}
	set HeightTop(v) {
		if (this.isDynamic) {
			this.state.heightTop = v
		}
		this.data.heightTop = v
	}
	/** Get WidthBottom. */
	get WidthBottom() {
		return this.data.widthBottom
	}
	set WidthBottom(v) {
		if (this.isDynamic) {
			this.state.widthBottom = v
		}
		this.data.widthBottom = v
	}
	/** Get WidthTop. */
	get WidthTop() {
		return this.data.widthTop
	}
	set WidthTop(v) {
		if (this.isDynamic) {
			this.state.widthTop = v
		}
		this.data.widthTop = v
	}
	/** Get Material. */
	get Material() {
		return this.data.szMaterial
	}
	set Material(v) {
		if (this.isDynamic) {
			this.state.material = v
		}
		this.data.szMaterial = v
	}
	/** Get Type. */
	get Type() {
		return this.data.rampType
	}
	set Type(v) {
		if (this.isDynamic) {
			this.state.type = v
		}
		this.data.rampType = v
	}
	/** Get Image. */
	get Image() {
		return this.data.szImage
	}
	set Image(v) {
		this._assertNonHdrImage(v)
		if (this.isDynamic) {
			this.state.texture = v
		}
		this.data.szImage = v
	}
	/** Get ImageAlignment. */
	get ImageAlignment() {
		return this.data.imageAlignment
	}
	set ImageAlignment(v) {
		if (this.isDynamic) {
			this.state.textureAlignment = v
		}
		this.data.imageAlignment = v
	}
	/** Get HasWallImage. */
	get HasWallImage() {
		return this.data.imageWalls
	}
	set HasWallImage(v) {
		if (this.isDynamic) {
			this.state.hasWallImage = v
		}
		this.data.imageWalls = v
	}
	/** Get LeftWallHeight. */
	get LeftWallHeight() {
		return this.data.leftWallHeight
	}
	set LeftWallHeight(v) {
		if (this.isDynamic) {
			this.state.leftWallHeight = v
		}
		this.data.leftWallHeight = v
	}
	/** Get RightWallHeight. */
	get RightWallHeight() {
		return this.data.rightWallHeight
	}
	set RightWallHeight(v) {
		if (this.isDynamic) {
			this.state.rightWallHeight = v
		}
		this.data.rightWallHeight = v
	}
	/** Get VisibleLeftWallHeight. */
	get VisibleLeftWallHeight() {
		return this.data.leftWallHeightVisible
	}
	set VisibleLeftWallHeight(v) {
		if (this.isDynamic) {
			this.state.leftWallHeightVisible = v
		}
		this.data.leftWallHeightVisible = v
	}
	/** Get VisibleRightWallHeight. */
	get VisibleRightWallHeight() {
		return this.data.rightWallHeightVisible
	}
	set VisibleRightWallHeight(v) {
		if (this.isDynamic) {
			this.state.rightWallHeightVisible = v
		}
		this.data.rightWallHeightVisible = v
	}
	/** Get Elasticity. */
	get Elasticity() {
		return this.data.elasticity
	}
	set Elasticity(v) {
		this.data.elasticity = v
	}
	/** Get Friction. */
	get Friction() {
		return this.data.friction
	}
	set Friction(v) {
		this.data.friction = v
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
		return this.hits[0].isEnabled
	}
	set Collidable(v) {
		if (v !== this.Collidable) {
			for (const hit of this.hits) {
				hit.isEnabled = v
			}
		}
	}
	/** Get HasHitEvent. */
	get HasHitEvent() {
		return this.data.hitEvent
	}
	set HasHitEvent(v) {
		this.data.hitEvent = v
	}
	/** Get Threshold. */
	get Threshold() {
		return this.data.threshold
	}
	set Threshold(v) {
		this.data.threshold = v
	}
	/** Get Visible. */
	get Visible() {
		return this.data.isVisible
	}
	set Visible(v) {
		if (this.isDynamic) {
			this.state.isVisible = v
		}
		this.data.isVisible = v
	}
	/** Get ReflectionEnabled. */
	get ReflectionEnabled() {
		return this.data.isReflectionEnabled
	}
	set ReflectionEnabled(v) {
		this.data.isReflectionEnabled = v
	}
	/** Get DepthBias. */
	get DepthBias() {
		return this.data.depthBias
	}
	set DepthBias(v) {
		if (this.isDynamic) {
			this.state.depthBias = v
		}
		this.data.depthBias = v
	}
	/** Get WireDiameter. */
	get WireDiameter() {
		return this.data.wireDiameter
	}
	set WireDiameter(v) {
		this.data.wireDiameter = v
	}
	/** Get WireDistanceX. */
	get WireDistanceX() {
		return this.data.wireDistanceX
	}
	set WireDistanceX(v) {
		this.data.wireDistanceX = v
	}
	/** Get WireDistanceY. */
	get WireDistanceY() {
		return this.data.wireDistanceY
	}
	set WireDistanceY(v) {
		this.data.wireDistanceY = v
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

	/**
	 * No idea wtf this is supposed to do.
	 */
	public InterfaceSupportsErrorInfo(riid: any): boolean {
		return false
	}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(RampApi.prototype)
	}
}
