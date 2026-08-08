// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { EventProxy } from '../../game/event-proxy.js'
import type { Player } from '../../game/player.js'
import { ItemApi } from '../item-api.js'
import type { ItemData } from '../item-data.js'
import type { Table } from '../table/table.js'
import type { TimerHit } from '../timer/timer-hit.js'
import type { CollectionData } from './collection-data.js'

/** Collection API — VBS surface for `Collection`. @see https://github.com/vpinball/vpinball/blob/master/collection.cpp */
export class CollectionApi extends ItemApi<CollectionData> implements IterableIterator<ItemApi<ItemData>> {
	private pointer = 0

	/** Proxy mimics an array of item APIs. */
	public static getInstance(
		data: CollectionData,
		items: Array<ItemApi<ItemData>>,
		events: EventProxy,
		player: Player,
		table: Table,
	): CollectionApi {
		return new Proxy<CollectionApi>(new CollectionApi(data, items, events, player, table), {
			get: (api, prop) => {
				if (prop === 'length') return api.items[prop as unknown as number]
				try {
					const intProp = parseInt(prop as string, 10)
					if (!Number.isNaN(intProp)) return api.items[intProp]
				} catch {}
				return Reflect.get(api, prop)
			},
			set: (api, prop, value) => {
				const intProp = parseInt(prop as string, 10)
				/* istanbul ignore next */
				if (!Number.isNaN(intProp))
					throw new Error('Setting a new child of a collection by property is not supported.')
				Reflect.set(api, prop, value)
				return true
			},
		})
	}

	private constructor(
		data: CollectionData,
		private readonly items: Array<ItemApi<ItemData>>,
		events: EventProxy,
		player: Player,
		table: Table,
	) {
		super(data, events, player, table)
	}

	public next(): IteratorResult<ItemApi<ItemData>> {
		if (this.pointer < this.items.length) return { done: false, value: this.items[this.pointer++] }
		return { done: true, value: null as unknown as ItemApi<ItemData> }
	}

	public _getTimers(): TimerHit[] {
		return []
	}

	public [Symbol.iterator](): IterableIterator<ItemApi<ItemData>> {
		return this
	}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(CollectionApi.prototype)
	}
}
