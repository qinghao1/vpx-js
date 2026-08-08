// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import type { EventProxy } from '../game/event-proxy.js'
import type { ItemData } from './item-data.js'

export abstract class Item<DATA extends ItemData> {
	protected events?: EventProxy
	constructor(public readonly data: DATA) {}
	getName(): string {
		return this.data.getName()
	}
	getEventProxy(): EventProxy {
		return this.events!
	}
}
