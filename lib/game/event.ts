// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/** Visual Pinball event DISPIDs. */
export enum Event {
	GameEventsKeyDown = 1000,
	GameEventsKeyUp = 1001,
	GameEventsInit = 1002,
	GameEventsMusicDone = 1003,
	GameEventsExit = 1004,
	GameEventsPaused = 1005,
	GameEventsUnPaused = 1006,

	SurfaceEventsSlingshot = 1101,

	FlipperEventsCollide = 1200,

	TimerEventsTimer = 1300,
	SpinnerEventsSpin = 1301,
	TargetEventsDropped = 1302,
	TargetEventsRaised = 1303,
	LightSeqEventsPlayDone = 1320,

	HitEventsHit = 1400,
	HitEventsUnhit = 1401,
	LimitEventsEOS = 1402,
	LimitEventsBOS = 1403,
}
