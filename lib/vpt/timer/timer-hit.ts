// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { EventProxy } from '../../game/event-proxy.js'

/** Timer hit. */
export class TimerHit {
	public readonly pfe: EventProxy
	public nextFire: number
	public interval: number

	constructor(pfe: EventProxy, nextFire: number, interval: number) {
		this.pfe = pfe
		this.nextFire = nextFire
		this.interval = interval
	}
}
