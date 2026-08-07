// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { EventProxy } from '../../game/event-proxy.js'
import type { Player } from '../../game/player.js'
import { degToRad, radToDeg } from '../../math/float.js'
import { clamp } from '../../math/functions.js'
import { PHYS_FACTOR } from '../../physics/constants.js'
import { ItemApi } from '../item-api.js'
import type { Table } from '../table/table.js'
import type { SpinnerData } from './spinner-data.js'
import type { SpinnerMover } from './spinner-mover.js'
import type { SpinnerState } from './spinner-state.js'

export class SpinnerApi extends ItemApi<SpinnerData> {
	private readonly state: SpinnerState
	private readonly mover: SpinnerMover

	constructor(
		state: SpinnerState,
		mover: SpinnerMover,
		data: SpinnerData,
		events: EventProxy,
		player: Player,
		table: Table,
	) {
		super(data, events, player, table)
		this.state = state
		this.mover = mover
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
		return this.mover.damping ** (1.0 / PHYS_FACTOR)
	}
	set Damping(v) {
		this.mover.damping = clamp(v, 0.0, 1.0) ** PHYS_FACTOR
	}
	get Material() {
		return this.state.material
	}
	set Material(v) {
		this.state.material = v
	}
	get Image() {
		return this.state.texture
	}
	set Image(v) {
		this._assertNonHdrImage(v)
		this.state.texture = v
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
		return this.state.showBracket
	}
	set ShowBracket(v) {
		this.state.showBracket = v
	}
	get AngleMax() {
		return radToDeg(this.mover.angleMax)
	}
	set AngleMax(v) {
		if (this.data.angleMin !== this.data.angleMax) {
			// allow only if in limited angle mode
			v = clampAngleToRad(v, this.data.angleMin, this.data.angleMax)
			if (this.mover.angleMin < v) {
				// Min is smaller???
				this.mover.angleMax = v // yes set new max
			} else {
				this.mover.angleMin = v // no set new minumum
			}
		}
	}
	get AngleMin() {
		return radToDeg(this.mover.angleMin)
	}
	set AngleMin(v) {
		if (this.data.angleMin !== this.data.angleMax) {
			// allow only if in limited angle mode
			v = clampAngleToRad(v, this.data.angleMin, this.data.angleMax)
			if (this.mover.angleMax > v) {
				// max is bigger
				this.mover.angleMin = v // then set new minumum
			} else {
				this.mover.angleMax = v // else set new max
			}
		}
	}
	get Elasticity() {
		return this.mover.elasticity
	}
	set Elasticity(v) {
		this.mover.elasticity = v
	}
	get Visible() {
		return this.state.isVisible
	} // TODO check if isOpacticyActivated must be true as well
	set Visible(v) {
		this.state.isVisible = v
	}
	get ReflectionEnabled() {
		return this.data.isReflectionEnabled
	}
	set ReflectionEnabled(v) {
		this.data.isReflectionEnabled = v
	}
	get CurrentAngle() {
		return this.state.angle
	}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(SpinnerApi.prototype)
	}
}

function clampAngleToRad(angle: number, angleMin: number, angleMax: number): number {
	if (angle > angleMax) {
		angle = angleMax
	} else if (angle < angleMin) {
		angle = angleMin
	}
	return degToRad(angle)
}
