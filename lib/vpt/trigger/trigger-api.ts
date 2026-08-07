// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { EventProxy } from '../../game/event-proxy.js'
import type { Player } from '../../game/player.js'
import { Enums } from '../enums.js'
import { ItemApi } from '../item-api.js'
import type { Table } from '../table/table.js'
import type { TriggerData } from './trigger-data.js'
import type { TriggerState } from './trigger-state.js'

/** Trigger API. */
export class TriggerApi extends ItemApi<TriggerData> {
	private readonly state: TriggerState

	constructor(state: TriggerState, data: TriggerData, events: EventProxy, player: Player, table: Table) {
		super(data, events, player, table)
		this.state = state
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
	/** Get Radius. */
	get Radius() {
		return this.data.radius
	}
	set Radius(v) {
		this.data.radius = v
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
		return this.data.isEnabled
	}
	set Enabled(v) {
		this.data.isEnabled = v
	}
	/** Get Visible. */
	get Visible() {
		return this.state.isVisible
	}
	set Visible(v) {
		this.data.isVisible = v
		this.state.isVisible = v && this.data.shape !== Enums.TriggerShape.TriggerNone
	}
	/** Get HitHeight. */
	get HitHeight() {
		return this.data.hitHeight
	}
	set HitHeight(v) {
		this.data.hitHeight = v
	}
	/** Get Rotation. */
	get Rotation() {
		return this.data.rotation
	}
	set Rotation(v) {
		this.data.rotation = v
	}
	/** Get WireThickness. */
	get WireThickness() {
		return this.data.wireThickness
	}
	set WireThickness(v) {
		this.data.wireThickness = v
	}
	/** Get AnimSpeed. */
	get AnimSpeed() {
		return this.data.animSpeed
	}
	set AnimSpeed(v) {
		this.data.animSpeed = v
	}
	/** Get Material. */
	get Material() {
		return this.state.material
	}
	set Material(v) {
		this.state.material = v
	}
	/** Get TriggerShape. */
	get TriggerShape() {
		return this.data.shape
	}
	set TriggerShape(v) {
		this.data.shape = v
		this.state.isVisible = this.data.isVisible && v !== Enums.TriggerShape.TriggerNone
	}
	/** Get ReflectionEnabled. */
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
				this.player.destroyBall(ball) // inside trigger volume?
			}
		}
		return cnt
	}

	public _ballCountOver(): number {
		return super._ballCountOver(this.events)
	}

	/**
	 * No idea wtf this is supposed to do.
	 */
	public InterfaceSupportsErrorInfo(riid: any): boolean {
		return false
	}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(TriggerApi.prototype)
	}
}
