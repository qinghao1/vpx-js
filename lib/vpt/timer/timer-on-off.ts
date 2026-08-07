// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { TimerHit } from './timer-hit.js'

export class TimerOnOff {
	public enabled: boolean
	public timer: TimerHit

	constructor(enabled: boolean, timer: TimerHit) {
		this.enabled = enabled
		this.timer = timer
	}
}
