// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { HitObject } from '../physics/hit-object.js'
import type { Ball } from '../vpt/ball/ball.js'
import { Event } from './event.js'
import type { IPlayable } from './iplayable.js'
import { isScriptable } from './iscriptable.js'

export class EventProxy {
	/**
	 * while playing and the ball hits the mesh the hit threshold is updated here
	 */
	public currentHitThreshold: number = 0
	public singleEvents: boolean = true
	public readonly eventCollection: EventProxy[] = []
	public readonly eventCollectionItemPos: number[] = []

	private readonly playable: IPlayable

	/**
	 * Logic executed on collision.
	 *
	 * This replaces the dreaded object casts in VP where the hit logic must
	 * be aware of the underlying object.
	 */
	public onCollision?: (obj: HitObject, ball: Ball, dot: number) => void

	/**
	 * If implemented and false is returned, the hit test is skipped.
	 */
	public abortHitTest?: () => boolean

	constructor(playable: IPlayable) {
		this.playable = playable
	}

	public fireVoidEvent(e: Event) {
		this.fireDispID(e)
	}

	public fireVoidEventParm(e: Event, ...params: any[]): void {
		this.fireDispID(e, ...params)
		//logger().info('[%s] fireGroupEvent(%s, %s)', this.playable.getName(), e, data);
	}

	public fireGroupEvent(e: Event): void {
		for (let i = 0; i < this.eventCollection.length; i++) {
			this.eventCollection[i].fireVoidEventParm(e, this.eventCollectionItemPos[i])
		}

		if (this.singleEvents) {
			this.fireDispID(e)
		}
		//logger().info('[%s] fireGroupEvent(%s)', this.playable.getName(), e);
	}

	private fireDispID(e: Event, ...params: any[]) {
		if (isScriptable(this.playable)) {
			this.playable.getApi().emit.call(this.playable.getApi(), getEventName(e), ...params)
			//logger().info('[%s] fireDispID(%s)', this.playable.getName(), e);
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
