// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Event } from '../../game/event.js'
import type { EventProxy } from '../../game/event-proxy.js'
import type { IAnimation } from '../../game/ianimatable.js'
import type { Table } from '../table/table.js'
import type { FlipperState } from './flipper-state.js'

const SENTINEL = 123486

/** Mirrors Flipper::UpdateAnimation firing Animate when angle changes. */
export class FlipperAnimation implements IAnimation {
	private lastAngle = SENTINEL
	private mover?: { angle: number }
	private events?: EventProxy

	constructor(
		private readonly state: FlipperState,
		events?: EventProxy,
	) {
		this.events = events
	}

	public setEvents(events: EventProxy): void {
		this.events = events
	}

	public setMover(mover: { angle: number }): void {
		this.mover = mover
	}

	public init(_timeMsec: number): void {}

	public updateAnimation(_timeMsec: number, _table: Table): void {
		const cur = this.mover?.angle ?? this.state.angle
		if (cur !== this.lastAngle && this.events) {
			this.lastAngle = cur
			this.events.fireGroupEvent(Event.AnimateEventsAnimate)
		}
	}
}
