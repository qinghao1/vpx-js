// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Event } from '../../game/event.js'
import type { EventProxy } from '../../game/event-proxy.js'
import type { IAnimation } from '../../game/ianimatable.js'
import { PlayerPhysics } from '../../game/player-physics.js'
import type { Table } from '../table/table.js'
import { HitTarget } from './hit-target.js'
import type { HitTargetData } from './hit-target-data.js'
import type { HitTargetState } from './hit-target-state.js'

export class HitTargetAnimation implements IAnimation {
	private readonly data: HitTargetData
	private readonly state: HitTargetState
	private readonly events: EventProxy

	public timeStamp = 0
	public hitEvent = false
	public moveDown = true
	public moveAnimation = false
	private timeMsec = 0

	constructor(data: HitTargetData, state: HitTargetState, events: EventProxy) {
		this.data = data
		this.state = state
		this.events = events
	}

	public init(timeMsec: number): void {
		this.timeMsec = timeMsec
	}

	public updateAnimation(newTimeMsec: number, table: Table): void {
		const oldTimeMsec = this.timeMsec < newTimeMsec ? this.timeMsec : newTimeMsec
		this.timeMsec = newTimeMsec
		const diffTimeMsec = newTimeMsec - oldTimeMsec

		if (this.hitEvent) {
			if (!this.data.isDropped) {
				this.moveDown = true
			}
			this.moveAnimation = true
			this.hitEvent = false
		}
		if (this.data.isDropTarget()) {
			if (this.moveAnimation) {
				let step = this.data.dropSpeed * table.getScaleZ()
				const limit = HitTarget.DROP_TARGET_LIMIT * table.getScaleZ()
				if (this.moveDown) {
					step = -step
				} else if (this.timeMsec - this.timeStamp < this.data.raiseDelay) {
					step = 0.0
				}
				this.state.zOffset += step * diffTimeMsec
				if (this.moveDown) {
					if (this.state.zOffset <= -limit) {
						this.state.zOffset = -limit
						this.moveDown = false
						this.data.isDropped = true
						this.moveAnimation = false
						this.timeStamp = 0
						if (this.data.useHitEvent) {
							this.events.fireGroupEvent(Event.TargetEventsDropped)
						}
					}
				} else {
					if (this.state.zOffset >= 0.0) {
						this.state.zOffset = 0.0
						this.moveAnimation = false
						this.data.isDropped = false
						if (this.data.useHitEvent) {
							this.events.fireGroupEvent(Event.TargetEventsRaised)
						}
					}
				}
				//UpdateTarget();
			}
		} else {
			if (this.moveAnimation) {
				let step = this.data.dropSpeed * table.getScaleZ()
				const limit = 13.0 * table.getScaleZ()
				if (!this.moveDown) {
					step = -step
				}
				this.state.xRotation += step * diffTimeMsec
				if (this.moveDown) {
					if (this.state.xRotation >= limit) {
						this.state.xRotation = limit
						this.moveDown = false
					}
				} else {
					if (this.state.xRotation <= 0.0) {
						this.state.xRotation = 0.0
						this.moveAnimation = false
					}
				}
				//UpdateTarget();
			}
		}
	}
}
