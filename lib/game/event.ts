// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/** VP event DISPIDs. @see https://github.com/vpinball/vpinball/blob/master/pin/input.h */
export enum Event {
	GameEventsKeyDown = 1000,
	GameEventsKeyUp = 1001,
	GameEventsInit = 1002,
	GameEventsMusicDone = 1003,
	GameEventsExit = 1004,
	GameEventsPaused = 1005,
	GameEventsUnPaused = 1006,
	GameEventsOptionEvent = 1007,

	/** Fired by slingshot wall segments on a hard kick (`line-seg-slingshot.ts`); script name `Slingshot`. */
	SurfaceEventsSlingshot = 1101,

	FlipperEventsCollide = 1200,

	TimerEventsTimer = 1300,
	SpinnerEventsSpin = 1301,
	TargetEventsDropped = 1302,
	TargetEventsRaised = 1303,
	/** Fired when a light sequencer drains its play queue (`lightseq-animation.ts`); script name `PlayDone`. */
	LightSeqEventsPlayDone = 1320,

	HitEventsHit = 1400,
	HitEventsUnhit = 1401,
	LimitEventsEOS = 1402,
	LimitEventsBOS = 1403,
	AnimateEventsAnimate = 1404,
}
