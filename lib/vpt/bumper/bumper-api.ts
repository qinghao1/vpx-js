// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { EventProxy } from '../../game/event-proxy.js'
import type { Player } from '../../game/player.js'
import { ItemApi } from '../item-api.js'
import type { Table } from '../table/table.js'
import type { BumperAnimation } from './bumper-animation.js'
import type { BumperData } from './bumper-data.js'
import type { BumperState } from './bumper-state.js'

/** Bumper API. @see https://github.com/vpinball/vpinball/blob/master/bumper.cpp */
export class BumperApi extends ItemApi<BumperData> {
	private readonly isBaseDynamic: boolean
	private readonly isCapDynamic: boolean
	private readonly isRingDynamic: boolean
	private readonly isSkirtDynamic: boolean

	constructor(
		private readonly state: BumperState,
		private readonly animation: BumperAnimation,
		data: BumperData,
		events: EventProxy,
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
	get RingDropOffset() {
		return this.data.ringDropOffset
	}
	set RingDropOffset(v) {
		this.data.ringDropOffset = v
	}
	get Orientation() {
		return this.data.orientation
	}
	set Orientation(v) {
		this.data.orientation = v
	}
	get Threshold() {
		return this.data.threshold
	}
	set Threshold(v) {
		this.data.threshold = v
	}
	get CapMaterial() {
		return this.data.szCapMaterial
	}
	set CapMaterial(v) {
		if (this.isCapDynamic) this.state.capMaterial = v
		this.data.szCapMaterial = v
	}
	get RingMaterial() {
		return this.data.szRingMaterial
	}
	set RingMaterial(v) {
		if (this.isRingDynamic) this.state.ringMaterial = v
		this.data.szRingMaterial = v
	}
	get BaseMaterial() {
		return this.data.szBaseMaterial
	}
	set BaseMaterial(v) {
		if (this.isBaseDynamic) this.state.baseMaterial = v
		this.data.szBaseMaterial = v
	}
	get SkirtMaterial() {
		return this.data.szSkirtMaterial
	}
	set SkirtMaterial(v) {
		if (this.isSkirtDynamic) this.state.skirtMaterial = v
		this.data.szSkirtMaterial = v
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
	}
	get CapVisible() {
		return this.data.isCapVisible
	}
	set CapVisible(v) {
		if (this.isCapDynamic) this.state.isCapVisible = v
		this.data.isCapVisible = v
	}
	get BaseVisible() {
		return this.data.isBaseVisible
	}
	set BaseVisible(v) {
		if (this.isBaseDynamic) this.state.isBaseVisible = v
		this.data.isBaseVisible = v
	}
	get RingVisible() {
		return this.data.isRingVisible
	}
	set RingVisible(v) {
		if (this.isRingDynamic) this.state.isRingVisible = v
		this.data.isRingVisible = v
	}
	get SkirtVisible() {
		return this.data.isSkirtVisible
	}
	set SkirtVisible(v) {
		if (this.isSkirtDynamic) this.state.isSkirtVisible = v
		this.data.isSkirtVisible = v
	}
	get ReflectionEnabled() {
		return this.data.isReflectionEnabled
	}
	set ReflectionEnabled(v) {
		this.data.isReflectionEnabled = v
	}
	get EnableSkirtAnimation() {
		return this.animation.enableSkirtAnimation
	}
	set EnableSkirtAnimation(v) {
		this.animation.enableSkirtAnimation = v
	}

	get CurrentRingOffset() {
		return this.state.ringOffset
	}

	get RotX() {
		return this.state.skirtRotX
	}

	get RotY() {
		return this.state.skirtRotY
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
