// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { EventProxy } from '../../game/event-proxy.js'
import type { Player } from '../../game/player.js'
import { Enums } from '../enums.js'
import { ItemApi } from '../item-api.js'
import type { Table } from '../table/table.js'
import type { TriggerData } from './trigger-data.js'
import type { TriggerState } from './trigger-state.js'

/** Trigger API — VBS surface for `Trigger`. @see https://github.com/vpinball/vpinball/blob/master/trigger.cpp */
export class TriggerApi extends ItemApi<TriggerData> {
	constructor(
		private readonly _state: TriggerState,
		data: TriggerData,
		events: EventProxy,
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
	get Radius() {
		return this.data.radius
	}
	set Radius(v) {
		this.data.radius = v
	}
	get Surface() {
		return this.data.szSurface
	}
	set Surface(v) {
		this.data.szSurface = v
	}
	get Enabled() {
		return this.data.isEnabled
	}
	set Enabled(v) {
		this.data.isEnabled = v
	}
	get Visible() {
		return this._state.isVisible
	}
	set Visible(v) {
		this.data.isVisible = v
		this._state.isVisible = v && this.data.shape !== Enums.TriggerShape.TriggerNone
	}
	get HitHeight() {
		return this.data.hitHeight
	}
	set HitHeight(v) {
		this.data.hitHeight = v
	}
	get Rotation() {
		return this.data.rotation
	}
	set Rotation(v) {
		this.data.rotation = v
	}
	get WireThickness() {
		return this.data.wireThickness
	}
	set WireThickness(v) {
		this.data.wireThickness = v
	}
	get AnimSpeed() {
		return this.data.animSpeed
	}
	set AnimSpeed(v) {
		this.data.animSpeed = v
	}
	get Material() {
		return this._state.material
	}
	set Material(v) {
		this._state.material = v
	}
	get TriggerShape() {
		return this.data.shape
	}
	set TriggerShape(v) {
		this.data.shape = v
		this._state.isVisible = this.data.isVisible && v !== Enums.TriggerShape.TriggerNone
	}
	get ReflectionEnabled() {
		return this.data.isReflectionEnabled
	}
	set ReflectionEnabled(v) {
		this.data.isReflectionEnabled = v
	}

	public DestroyBall(): number {
		let cnt = 0
		for (const ball of this.player.balls) {
			const j = ball.hit.isRealBall() ? ball.hit.vpVolObjs.indexOf(this.events) : -1
			if (j >= 0) {
				++cnt
				ball.hit.vpVolObjs.splice(j, 1)
				this.player.destroyBall(ball)
			}
		}
		return cnt
	}

	get BallCntOver(): number {
		return super._ballCountOver(this.events)
	}

	public InterfaceSupportsErrorInfo(_riid: unknown): boolean {
		return false
	}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(TriggerApi.prototype)
	}
}
