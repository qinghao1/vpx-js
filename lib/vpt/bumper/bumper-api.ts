// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { EventProxy } from '../../game/event-proxy.js'
import type { Player } from '../../game/player.js'
import { ItemApi } from '../item-api.js'
import type { Table } from '../table/table.js'
import type { BumperAnimation } from './bumper-animation.js'
import type { BumperData } from './bumper-data.js'
import type { BumperState } from './bumper-state.js'

/** Bumper API. */
export class BumperApi extends ItemApi<BumperData> {
	private readonly state: BumperState
	private readonly animation: BumperAnimation
	private readonly isBaseDynamic: boolean
	private readonly isCapDynamic: boolean
	private readonly isRingDynamic: boolean
	private readonly isSkirtDynamic: boolean

	constructor(
		state: BumperState,
		animation: BumperAnimation,
		data: BumperData,
		events: EventProxy,
		player: Player,
		table: Table,
	) {
		super(data, events, player, table)
		this.state = state
		this.animation = animation
		const baseMaterial = table.getMaterial(data.szBaseMaterial)
		const capMaterial = table.getMaterial(data.szCapMaterial)
		const ringMaterial = table.getMaterial(data.szRingMaterial)
		const skirtMaterial = table.getMaterial(data.szSkirtMaterial)
		this.isBaseDynamic = !!baseMaterial && baseMaterial.isOpacityActive
		this.isCapDynamic = !!capMaterial && capMaterial.isOpacityActive
		this.isRingDynamic = !!ringMaterial && ringMaterial.isOpacityActive
		this.isSkirtDynamic = !!skirtMaterial && skirtMaterial.isOpacityActive
	}

	/** Get Radius. */
	get Radius() {
		return this.data.radius
	}
	set Radius(v) {
		this.data.radius = v
	}
	/** Get Force. */
	get Force() {
		return this.data.force
	}
	set Force(v) {
		this.data.force = v
	}
	/** Get Scatter. */
	get Scatter() {
		return this.data.scatter
	}
	set Scatter(v) {
		this.data.scatter = v
	}
	/** Get HeightScale. */
	get HeightScale() {
		return this.data.heightScale
	}
	set HeightScale(v) {
		this.data.heightScale = v
	}
	/** Get RingSpeed. */
	get RingSpeed() {
		return this.data.ringSpeed
	}
	set RingSpeed(v) {
		this.data.ringSpeed = v
	}
	/** Get RingDropOffset. */
	get RingDropOffset() {
		return this.data.ringDropOffset
	}
	set RingDropOffset(v) {
		this.data.ringDropOffset = v
	}
	/** Get Orientation. */
	get Orientation() {
		return this.data.orientation
	}
	set Orientation(v) {
		this.data.orientation = v
	}
	/** Get Threshold. */
	get Threshold() {
		return this.data.threshold
	}
	set Threshold(v) {
		this.data.threshold = v
	}
	/** Get CapMaterial. */
	get CapMaterial() {
		return this.data.szCapMaterial
	}
	set CapMaterial(v) {
		if (this.isCapDynamic) {
			this.state.capMaterial = v
		}
		this.data.szCapMaterial = v
	}
	/** Get RingMaterial. */
	get RingMaterial() {
		return this.data.szRingMaterial
	}
	set RingMaterial(v) {
		if (this.isRingDynamic) {
			this.state.ringMaterial = v
		}
		this.data.szRingMaterial = v
	}
	/** Get BaseMaterial. */
	get BaseMaterial() {
		return this.data.szBaseMaterial
	}
	set BaseMaterial(v) {
		if (this.isBaseDynamic) {
			this.state.baseMaterial = v
		}
		this.data.szBaseMaterial = v
	}
	/** Get SkirtMaterial. */
	get SkirtMaterial() {
		return this.data.szSkirtMaterial
	}
	set SkirtMaterial(v) {
		if (this.isSkirtDynamic) {
			this.state.skirtMaterial = v
		}
		this.data.szSkirtMaterial = v
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
	/** Get HasHitEvent. */
	get HasHitEvent() {
		return this.data.hitEvent
	}
	set HasHitEvent(v) {
		this.data.hitEvent = v
	}
	/** Get Collidable. */
	get Collidable() {
		return this.data.isCollidable
	}
	set Collidable(v) {
		this.data.isCollidable = v
	}
	/** Get CapVisible. */
	get CapVisible() {
		return this.data.isCapVisible
	}
	set CapVisible(v) {
		if (this.isCapDynamic) {
			this.state.isCapVisible = v
		}
		this.data.isCapVisible = v
	}
	/** Get BaseVisible. */
	get BaseVisible() {
		return this.data.isBaseVisible
	}
	set BaseVisible(v) {
		if (this.isBaseDynamic) {
			this.state.isBaseVisible = v
		}
		this.data.isBaseVisible = v
	}
	/** Get RingVisible. */
	get RingVisible() {
		return this.data.isRingVisible
	}
	set RingVisible(v) {
		if (this.isRingDynamic) {
			this.state.isRingVisible = v
		}
		this.data.isRingVisible = v
	}
	/** Get SkirtVisible. */
	get SkirtVisible() {
		return this.data.isSkirtVisible
	}
	set SkirtVisible(v) {
		if (this.isSkirtDynamic) {
			this.state.isSkirtVisible = v
		}
		this.data.isSkirtVisible = v
	}
	/** Get ReflectionEnabled. */
	get ReflectionEnabled() {
		return this.data.isReflectionEnabled
	}
	set ReflectionEnabled(v) {
		this.data.isReflectionEnabled = v
	}
	/** Get EnableSkirtAnimation. */
	get EnableSkirtAnimation() {
		return this.animation.enableSkirtAnimation
	}
	set EnableSkirtAnimation(v) {
		this.animation.enableSkirtAnimation = v
	}

	public PlayHit() {
		this.animation.hitEvent = true
	}

	/**
	 * No idea wtf this is supposed to do.
	 */
	public InterfaceSupportsErrorInfo(riid: any): boolean {
		return false
	}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(BumperApi.prototype)
	}
}
