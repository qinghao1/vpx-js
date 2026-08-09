// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/**
 * Amount of msecs to wait (at least) until same timer can be triggered again
 * (e.g. they can fall behind, if set to > 1, as update cycle is 1000Hz)
 */
export const MAX_TIMER_MSEC_INTERVAL = 1
/**
 * Amount of msecs that all timers combined can take per frame (e.g. they can
 * fall behind, if set to < somelargevalue)
 */
export const MAX_TIMERS_MSEC_OVERALL = 5

export enum TimerMode {
	Update = 0,
	OnNewFrame = -1,
	OnGameSync = -2,
}

export const TIMER_DISABLED = 0xffffffff
