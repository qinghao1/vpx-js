// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { Event } from '../../game/event.js'
import type { EventProxy } from '../../game/event-proxy.js'
import type { IAnimation } from '../../game/ianimatable.js'
import type { Table } from '../table/table.js'
import type { SpinnerState } from './spinner-state.js'

export class SpinnerAnimation implements IAnimation {
	private lastAngle = Number.NaN
	private events?: EventProxy
	constructor(
		private readonly state: SpinnerState,
		events?: EventProxy,
	) {
		this.events = events
	}
	public setEvents(events: EventProxy): void {
		this.events = events
	}
	public init(_timeMsec: number): void {}
	public updateAnimation(_timeMsec: number, _table: Table): void {
		const cur = this.state.angle
		if (cur !== this.lastAngle && this.events) {
			this.lastAngle = cur
			this.events.fireGroupEvent(Event.AnimateEventsAnimate)
		}
	}
}
