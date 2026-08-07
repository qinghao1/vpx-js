// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { HitObject } from '../physics/hit-object.js'
import type { Ball } from '../vpt/ball/ball.js'
import { Event } from './event.js'
import type { IPlayable } from './iplayable.js'
import { isScriptable } from './iscriptable.js'

/** Bridges gameplay events to script APIs. */
export class EventProxy {
	/** Current hit threshold updated during play. */
	public currentHitThreshold = 0
	public singleEvents = true
	public readonly eventCollection: EventProxy[] = []
	public readonly eventCollectionItemPos: number[] = []

	private readonly playable: IPlayable

	/** Custom collision logic replacing VP object casts. */
	public onCollision?: (obj: HitObject, ball: Ball, dot: number) => void

	/** Return false to skip the hit test. */
	public abortHitTest?: () => boolean

	constructor(playable: IPlayable) {
		this.playable = playable
	}

	/** Fires an event without parameters. */
	public fireVoidEvent(e: Event): void {
		this.fireDispID(e)
	}

	/** Fires an event with parameters. */
	public fireVoidEventParm(e: Event, ...params: any[]): void {
		this.fireDispID(e, ...params)
	}

	/** Fires the event on grouped proxies and self. */
	public fireGroupEvent(e: Event): void {
		for (let i = 0; i < this.eventCollection.length; i++) {
			this.eventCollection[i].fireVoidEventParm(e, this.eventCollectionItemPos[i])
		}
		if (this.singleEvents) this.fireDispID(e)
	}

	private fireDispID(e: Event, ...params: any[]): void {
		if (isScriptable(this.playable)) {
			this.playable.getApi().emit.call(this.playable.getApi(), getEventName(e), ...params)
		}
	}
}

function getEventName(event: Event): string {
	switch (event) {
		case Event.FlipperEventsCollide:
			return 'Collide'
		case Event.GameEventsExit:
			return 'Exit'
		case Event.GameEventsInit:
			return 'Init'
		case Event.GameEventsKeyDown:
			return 'KeyDown'
		case Event.GameEventsKeyUp:
			return 'KeyUp'
		case Event.GameEventsMusicDone:
			return 'MusicDone'
		case Event.GameEventsPaused:
			return 'Paused'
		case Event.GameEventsUnPaused:
			return 'UnPaused'
		case Event.HitEventsHit:
			return 'Hit'
		case Event.HitEventsUnhit:
			return 'Unhit'
		case Event.LightSeqEventsPlayDone:
			return 'PlayDone'
		case Event.LimitEventsBOS:
			return 'LimitBOS'
		case Event.LimitEventsEOS:
			return 'LimitEOS'
		case Event.SpinnerEventsSpin:
			return 'Spin'
		case Event.SurfaceEventsSlingshot:
			return 'Slingshot'
		case Event.TargetEventsDropped:
			return 'Dropped'
		case Event.TargetEventsRaised:
			return 'Raised'
		case Event.TimerEventsTimer:
			return 'Timer'
		default:
			return 'UnknownEvent' + event
	}
}
