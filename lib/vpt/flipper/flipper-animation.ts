// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { IAnimation } from '../../game/ianimatable.js'
import { Event } from '../../game/event.js'
import type { EventProxy } from '../../game/event-proxy.js'
import type { Table } from '../table/table.js'
import type { FlipperData } from './flipper-data.js'
import type { FlipperState } from './flipper-state.js'

/** Mirrors Flipper::UpdateAnimation firing Animate when angle changes. */
export class FlipperAnimation implements IAnimation {
	private lastAngle = 123486
	private mover?: { angle: number }
	private events?: EventProxy

	constructor(
		private readonly data: FlipperData,
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

	public init(_timeMsec: number): void {
		// Keep sentinel to fire on first frame (matches VP m_lastAngle=123486)
	}

	public updateAnimation(_timeMsec: number, _table: Table): void {
		const cur = this.mover?.angle ?? this.state.angle
		if (cur !== this.lastAngle && this.events) {
			this.lastAngle = cur
			this.events.fireGroupEvent(Event.AnimateEventsAnimate)
		}
	}
}
