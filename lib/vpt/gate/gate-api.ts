// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { MathUtils } from 'three'

import type { EventProxy } from '../../game/event-proxy.js'
import type { Player } from '../../game/player.js'
import { PHYS_FACTOR } from '../../physics/constants.js'
import type { LineSeg } from '../../physics/line-seg.js'
import { ItemApi } from '../item-api.js'
import type { Table } from '../table/table.js'
import type { GateData } from './gate-data.js'
import type { GateHit } from './gate-hit.js'
import type { GateMover } from './gate-mover.js'
import type { GateState } from './gate-state.js'

/** Gate API — VBS surface for `Gate`. @see https://github.com/vpinball/vpinball/blob/master/gate.cpp */
export class GateApi extends ItemApi<GateData> {
	constructor(
		data: GateData,
		events: EventProxy,
		private readonly _state: GateState,
		private readonly mover: GateMover,
		private readonly hitGate: GateHit,
		private readonly hitLine: LineSeg | null,
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
	get Height() {
		return this.data.height
	}
	set Height(v) {
		this.data.height = v
	}
	get Rotation() {
		return this.data.rotation
	}
	set Rotation(v) {
		this.data.rotation = v
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
	get Material() {
		return this._state.material
	}
	set Material(v) {
		this._state.material = v
	}
	get Open() {
		return this.mover.open
	}
	set Open(v) {
		this.openGate(v)
	}
	get Elasticity() {
		return this.data.elasticity
	}
	set Elasticity(v) {
		this.data.elasticity = v
	}
	get ShowBracket() {
		return this._state.showBracket
	}
	set ShowBracket(v) {
		this._state.showBracket = v
	}
	get CloseAngle() {
		return Math.round(MathUtils.radToDeg(this.mover.angleMin) * 1e5) / 1e5
	}
	set CloseAngle(v) {
		this.setCloseAngle(v)
	}
	get OpenAngle() {
		return Math.round(MathUtils.radToDeg(this.mover.angleMax) * 1e5) / 1e5
	}
	set OpenAngle(v) {
		this.setOpenAngle(v)
	}
	get Collidable() {
		return this.hitGate.isEnabled
	}
	set Collidable(v) {
		this.setCollidable(v)
	}
	get Friction() {
		return this.mover.friction
	}
	set Friction(v) {
		this.mover.friction = MathUtils.clamp(v, 0, 1)
	}
	get Damping() {
		return this.mover.damping ** (1 / PHYS_FACTOR)
	}
	set Damping(v) {
		this.mover.damping = MathUtils.clamp(v, 0, 1) ** PHYS_FACTOR
	}
	get GravityFactor() {
		return this.mover.gravityFactor
	}
	set GravityFactor(v) {
		this.mover.gravityFactor = MathUtils.clamp(v, 0, 1)
	}
	get Visible() {
		return this._state.isVisible
	}
	set Visible(v) {
		this._state.isVisible = v
	}
	get TwoWay() {
		return this.data.twoWay
	}
	set TwoWay(v) {
		if (this.hitGate) this.hitGate.twoWay = v
		else this.data.twoWay = v
		this.data.twoWay = v
	}
	get ReflectionEnabled() {
		return this.data.isReflectionEnabled
	}
	set ReflectionEnabled(v) {
		this.data.isReflectionEnabled = v
	}
	get CurrentAngle() {
		return this._state.angle
	}
	get DrawStyle() {
		return this.data.gateType
	}
	set DrawStyle(v) {
		this.data.gateType = v
	}

	private openGate(isOpen: boolean): void {
		this.mover.hitDirection = false
		this.mover.angleMax = this.data.angleMax
		this.mover.angleMin = this.data.angleMin
		this.mover.forcedMove = true
		this.mover.open = isOpen
		this.hitGate.isEnabled = isOpen ? false : this.data.isCollidable
		if (this.hitLine) this.hitLine.isEnabled = this.hitGate.isEnabled
		if (isOpen && this._state.angle < this.mover.angleMax) this.mover.angleSpeed = 0.2
		if (!isOpen && this._state.angle > this.mover.angleMin) this.mover.angleSpeed = -0.2
	}

	private setCloseAngle(deg: number): void {
		if (this.data.isCollidable) throw new Error("Gate is collidable! closing angles other than 0 aren't possible!")
		const a = MathUtils.clamp(MathUtils.degToRad(deg), this.data.angleMin, this.data.angleMax)
		if (this.mover.angleMax > a) this.mover.angleMin = a
		else this.mover.angleMax = a
	}

	private setOpenAngle(deg: number): void {
		if (this.data.isCollidable) throw new Error("Gate is collidable! open angles other than 90 aren't possible!")
		const a = MathUtils.clamp(MathUtils.degToRad(deg), this.data.angleMin, this.data.angleMax)
		if (this.mover.angleMin < a) this.mover.angleMax = a
		else this.mover.angleMin = a
	}

	private setCollidable(v: boolean): void {
		this.data.isCollidable = v
		this.hitGate.isEnabled = v
		if (this.hitLine) this.hitLine.isEnabled = v
		this.mover.angleMax = this.data.angleMax
		this.mover.angleMin = this.data.angleMin
		if (v) this.mover.angleMin = 0
	}

	public move(dir: number, speed: number, angle: number): void {
		this.mover.hitDirection = false
		this.mover.forcedMove = true
		this.mover.open = true
		this.hitGate.isEnabled = false
		if (this.hitLine) this.hitLine.isEnabled = false
		if (speed <= 0) speed = 0.2
		else speed *= Math.PI / 180

		if (!dir || angle !== 0) {
			angle *= Math.PI / 180
			angle = MathUtils.clamp(angle, this.data.angleMin, this.data.angleMax)
			const da = angle - this._state.angle
			if (da > 1e-5) dir = 1
			else if (da < -1e-5) dir = -1
			else {
				dir = 0
				this.mover.angleSpeed = 0
			}
		} else {
			angle = dir < 0 ? this.data.angleMin : this.data.angleMax
		}

		if (dir > 0) {
			this.mover.angleMax = angle
			if (this._state.angle < this.mover.angleMax) this.mover.angleSpeed = speed
		} else if (dir < 0) {
			this.mover.angleMin = angle
			if (this._state.angle > this.mover.angleMin) this.mover.angleSpeed = -speed
		}
	}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(GateApi.prototype)
	}
}
