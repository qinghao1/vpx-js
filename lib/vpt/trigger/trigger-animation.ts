// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { IAnimation } from '../../game/ianimatable.js'
import { PlayerPhysics } from '../../game/player-physics.js'
import { Enums } from '../enums.js'
import type { Table } from '../table/table.js'
import type { TriggerData } from './trigger-data.js'
import type { TriggerState } from './trigger-state.js'

/** Trigger animation. @see https://github.com/vpinball/vpinball/blob/master/trigger.cpp */
export class TriggerAnimation implements IAnimation {
	public hitEvent = false
	public unhitEvent = false

	private timeMsec = 0
	private doAnimation = false
	private moveDown = false

	constructor(
		private readonly data: TriggerData,
		private readonly state: TriggerState,
	) {}

	public init(): void {}

	public triggerAnimationHit(): void {
		this.hitEvent = true
	}

	public triggerAnimationUnhit(): void {
		this.unhitEvent = true
	}

	public updateAnimation(newTimeMsec: number, table: Table) {
		const oldTimeMsec = this.timeMsec < newTimeMsec ? this.timeMsec : newTimeMsec
		this.timeMsec = newTimeMsec
		const diffTimeMsec = newTimeMsec - oldTimeMsec
		let animLimit = this.data.shape === Enums.TriggerShape.TriggerStar ? this.data.radius * (1 / 5) : 32
		if (this.data.shape === Enums.TriggerShape.TriggerButton) animLimit = this.data.radius * (1 / 10)
		if (this.data.shape === Enums.TriggerShape.TriggerWireC) animLimit = 60
		if (this.data.shape === Enums.TriggerShape.TriggerWireD) animLimit = 25
		const limit = animLimit * table.getScaleZ()
		if (this.hitEvent) {
			this.doAnimation = true
			this.hitEvent = false
			this.state.heightOffset = 0
			this.moveDown = true
		}
		if (this.unhitEvent) {
			this.doAnimation = true
			this.unhitEvent = false
			this.hitEvent = false
			this.state.heightOffset = limit
			this.moveDown = false
		}
		if (this.doAnimation) {
			let step = diffTimeMsec * this.data.animSpeed * table.getScaleZ()
			if (this.moveDown) step = -step
			this.state.heightOffset += step
			if (this.moveDown) {
				if (this.state.heightOffset <= -limit) {
					this.state.heightOffset = -limit
					this.doAnimation = false
					this.moveDown = false
				}
			} else {
				if (this.state.heightOffset >= 0) {
					this.state.heightOffset = 0
					this.doAnimation = false
					this.moveDown = true
				}
			}
		}
	}
}
