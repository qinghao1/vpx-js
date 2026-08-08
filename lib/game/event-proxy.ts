// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { HitObject } from '../physics/hit-object.js'
import type { Ball } from '../vpt/ball/ball.js'
import { Event } from './event.js'
import type { IPlayable } from './iplayable.js'
import { isScriptable } from './iscriptable.js'

const EVENT_NAMES: Record<Event, string> = {
	[Event.FlipperEventsCollide]: 'Collide',
	[Event.GameEventsExit]: 'Exit',
	[Event.GameEventsInit]: 'Init',
	[Event.GameEventsKeyDown]: 'KeyDown',
	[Event.GameEventsKeyUp]: 'KeyUp',
	[Event.GameEventsMusicDone]: 'MusicDone',
	[Event.GameEventsPaused]: 'Paused',
	[Event.GameEventsUnPaused]: 'UnPaused',
	[Event.HitEventsHit]: 'Hit',
	[Event.HitEventsUnhit]: 'Unhit',
	[Event.LightSeqEventsPlayDone]: 'PlayDone',
	[Event.LimitEventsBOS]: 'LimitBOS',
	[Event.LimitEventsEOS]: 'LimitEOS',
	[Event.SpinnerEventsSpin]: 'Spin',
	[Event.SurfaceEventsSlingshot]: 'Slingshot',
	[Event.TargetEventsDropped]: 'Dropped',
	[Event.TargetEventsRaised]: 'Raised',
	[Event.TimerEventsTimer]: 'Timer',
	[Event.AnimateEventsAnimate]: 'Animate',
}

/** Bridges gameplay events to script APIs. */
export class EventProxy {
	public currentHitThreshold = 0
	public singleEvents = true
	public readonly eventCollection: EventProxy[] = []
	public readonly eventCollectionItemPos: number[] = []
	public onCollision?: (obj: HitObject, ball: Ball, dot: number) => void
	public abortHitTest?: () => boolean

	constructor(private readonly playable: IPlayable) {}

	public fireVoidEvent(e: Event): void {
		this.fireDispID(e)
	}

	public fireVoidEventParm(e: Event, ...params: unknown[]): void {
		this.fireDispID(e, ...params)
	}

	public fireGroupEvent(e: Event): void {
		for (let i = 0; i < this.eventCollection.length; i++) {
			this.eventCollection[i].fireVoidEventParm(e, this.eventCollectionItemPos[i])
		}
		if (this.singleEvents) this.fireDispID(e)
	}

	private fireDispID(e: Event, ...params: unknown[]): void {
		if (!isScriptable(this.playable)) return
		this.playable.getApi().emit.call(this.playable.getApi(), EVENT_NAMES[e] ?? `UnknownEvent${e}`, ...params)
	}
}
