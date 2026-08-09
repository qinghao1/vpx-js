// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { MathUtils } from 'three'

import { Event } from '../../game/event.js'
import type { EventProxy } from '../../game/event-proxy.js'
import { PHYS_FACTOR } from '../../physics/constants.js'
import type { MoverObject } from '../../physics/mover-object.js'
import type { SpinnerData } from './spinner-data.js'
import type { SpinnerState } from './spinner-state.js'

/** Spinner mover — 360° or limited swing with gravity. */
export class SpinnerMover implements MoverObject {
	public angleSpeed = 0
	public angleMax: number
	public angleMin: number
	public elasticity: number
	public damping: number

	constructor(
		private readonly data: SpinnerData,
		private readonly state: SpinnerState,
		private readonly events: EventProxy,
	) {
		this.angleMax = MathUtils.degToRad(data.angleMax)
		this.angleMin = MathUtils.degToRad(data.angleMin)
		this.damping = data.damping ** PHYS_FACTOR
		this.elasticity = data.elasticity
	}

	public updateDisplacements(dTime: number): void {
		if (this.data.angleMin !== this.data.angleMax) {
			this.state.angle += this.angleSpeed * dTime
			if (this.state.angle > this.angleMax) {
				this.state.angle = this.angleMax
				this.events.fireVoidEventParm(Event.LimitEventsEOS, Math.abs(MathUtils.radToDeg(this.angleSpeed)))
				if (this.angleSpeed > 0) this.angleSpeed *= -0.005 - this.elasticity
			}
			if (this.state.angle < this.angleMin) {
				this.state.angle = this.angleMin
				this.events.fireVoidEventParm(Event.LimitEventsBOS, Math.abs(MathUtils.radToDeg(this.angleSpeed)))
				if (this.angleSpeed < 0) this.angleSpeed *= -0.005 - this.elasticity
			}
		} else {
			const target =
				this.angleSpeed > 0
					? this.state.angle < Math.PI
						? Math.PI
						: 3 * Math.PI
					: this.state.angle < Math.PI
						? -Math.PI
						: Math.PI
			this.state.angle += this.angleSpeed * dTime
			if (
				(this.angleSpeed > 0 && this.state.angle > target) ||
				(this.angleSpeed < 0 && this.state.angle < target)
			) {
				this.events.fireGroupEvent(Event.SpinnerEventsSpin)
			}
			while (this.state.angle > 2 * Math.PI) this.state.angle -= 2 * Math.PI
			while (this.state.angle < 0) this.state.angle += 2 * Math.PI
		}
	}

	public updateVelocities(): void {
		this.angleSpeed -= Math.sin(this.state.angle) * (0.0025 * PHYS_FACTOR)
		this.angleSpeed *= this.damping
	}
}
