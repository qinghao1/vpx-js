// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { EventProxy } from '../game/event-proxy.js'
import type { ItemData } from './item-data.js'

/** Base for all table items. */
export abstract class Item<DATA extends ItemData> {
	protected readonly data: DATA
	protected events?: EventProxy
	protected constructor(data: DATA) {
		this.data = data
	}
	public getName(): string {
		return this.data.getName()
	}
	public getEventProxy(): EventProxy {
		return this.events!
	}
	protected getData(): DATA {
		return this.data
	}
}
