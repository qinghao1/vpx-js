// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { MathUtils } from 'three'

import type { EventProxy } from '../../game/event-proxy.js'
import type { Player } from '../../game/player.js'
import { PHYS_FACTOR } from '../../physics/constants.js'
import { ItemApi } from '../item-api.js'
import type { Table } from '../table/table.js'
import type { SpinnerData } from './spinner-data.js'
import type { SpinnerMover } from './spinner-mover.js'
import type { SpinnerState } from './spinner-state.js'

/** Spinner API — VBS surface for `Spinner`. @see https://github.com/vpinball/vpinball/blob/master/spinner.cpp */
export class SpinnerApi extends ItemApi<SpinnerData> {
	constructor(
		private readonly _state: SpinnerState,
		private readonly mover: SpinnerMover,
		data: SpinnerData,
		events: EventProxy,
		player: Player,
		table: Table,
	) {
		super(data, events, player, table)
	}

	get Length() {
		return this.data.length
	}
	set Length(v) {
		this.data.length = v
	}
	get Rotation() {
		return this.data.rotation
	}
	set Rotation(v) {
		this.data.rotation = v
	}
	get Height() {
		return this.data.height
	}
	set Height(v) {
		this.data.height = v
	}
	get Damping() {
		return this.mover.damping ** (1 / PHYS_FACTOR)
	}
	set Damping(v) {
		this.mover.damping = MathUtils.clamp(v, 0, 1) ** PHYS_FACTOR
	}
	get Material() {
		return this._state.material
	}
	set Material(v) {
		this._state.material = v
	}
	get Image() {
		return this._state.texture
	}
	set Image(v) {
		this._assertNonHdrImage(v)
		this._state.texture = v
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
	get ShowBracket() {
		return this._state.showBracket
	}
	set ShowBracket(v) {
		this._state.showBracket = v
	}
	get AngleMax() {
		return MathUtils.radToDeg(this.mover.angleMax)
	}
	set AngleMax(v) {
		if (this.data.angleMin !== this.data.angleMax) {
			v = clampAngleToRad(v, this.data.angleMin, this.data.angleMax)
			if (this.mover.angleMin < v) this.mover.angleMax = v
			else this.mover.angleMin = v
		}
	}
	get AngleMin() {
		return MathUtils.radToDeg(this.mover.angleMin)
	}
	set AngleMin(v) {
		if (this.data.angleMin !== this.data.angleMax) {
			v = clampAngleToRad(v, this.data.angleMin, this.data.angleMax)
			if (this.mover.angleMax > v) this.mover.angleMin = v
			else this.mover.angleMax = v
		}
	}
	get Elasticity() {
		return this.mover.elasticity
	}
	set Elasticity(v) {
		this.mover.elasticity = v
	}
	get Visible() {
		return this._state.isVisible
	}
	set Visible(v) {
		this._state.isVisible = v
	}
	get ReflectionEnabled() {
		return this.data.isReflectionEnabled
	}
	set ReflectionEnabled(v) {
		this.data.isReflectionEnabled = v
	}
	get CurrentAngle() {
		return MathUtils.radToDeg(this._state.angle)
	}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(SpinnerApi.prototype)
	}
}

function clampAngleToRad(angle: number, min: number, max: number): number {
	return MathUtils.degToRad(MathUtils.clamp(angle, min, max))
}
