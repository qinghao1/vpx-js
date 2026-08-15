// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EventProxy } from '../../game/event-proxy.js'
import type { IPlayable } from '../../game/iplayable.js'
import type { IScriptable } from '../../game/iscriptable.js'
import type { Player } from '../../game/player.js'
import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { handleBiffTag } from '../biff-helper.js'
import { Item } from '../item.js'
import { ItemApi } from '../item-api.js'
import { ItemData } from '../item-data.js'
import type { Table } from '../table/table.js'
import type { TimerHit } from '../timer/timer-hit.js'

const BOOL_MAP: Record<string, string> = { EVNT: 'fireEvents', SSNG: 'stopSingleEvents', GREL: 'groupElements' }

/** Collection data.
 * @see https://github.com/vpinball/vpinball/blob/master/collection.cpp */
export class CollectionData extends ItemData {
	public itemNames: string[] = []
	public fireEvents = false
	public groupElements = true
	public stopSingleEvents = false

	public static async fromStorage(storage: Storage, itemName: string): Promise<CollectionData> {
		const d = new CollectionData(itemName)
		await storage.streamFiltered(itemName, 0, BiffParser.stream(d.fromTag.bind(d)))
		return d
	}

	private constructor(itemName: string) {
		super(itemName)
	}

	private async fromTag(buffer: Uint8Array, tag: string, _offset: number, len: number): Promise<number> {
		if (tag === 'ITEM') {
			this.itemNames.push(this.getWideString(buffer, len))
			return 0
		}
		if (handleBiffTag(this, tag, buffer, len, { bool: BOOL_MAP })) return 0
		this.getCommonBlock(buffer, tag, len)
		return 0
	}
}

/** Collection API — VBS surface for `Collection`. @see https://github.com/vpinball/vpinball/blob/master/collection.cpp */
export class CollectionApi extends ItemApi<CollectionData> implements Iterable<ItemApi<ItemData>> {
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

	public _getTimers(): TimerHit[] {
		return []
	}

	public [Symbol.iterator](): IterableIterator<ItemApi<ItemData>> {
		return this.items[Symbol.iterator]()
	}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(CollectionApi.prototype)
	}
}

/** Collection item. @see https://github.com/vpinball/vpinball/blob/master/collection.cpp */
export class Collection extends Item<CollectionData> implements IPlayable, IScriptable<CollectionApi> {
	public readonly items: Array<ItemApi<ItemData>> = []
	private api?: CollectionApi

	get fireEvents() {
		return this.data.fireEvents
	}
	get stopSingleEvents() {
		return this.data.stopSingleEvents
	}

	public static async fromStorage(storage: Storage, itemName: string): Promise<Collection> {
		const data = await CollectionData.fromStorage(storage, itemName)
		return new Collection(data)
	}

	private constructor(data: CollectionData) {
		super(data)
	}

	public setupPlayer(player: Player, table: Table): void {
		this.events = new EventProxy(this)
		this.api = CollectionApi.getInstance(this.data, this.items, this.events, player, table)
	}

	public getItemNames() {
		return this.data.itemNames
	}

	public getEvents(): EventProxy {
		return this.events!
	}

	public getApi(): CollectionApi {
		return this.api!
	}

	public getEventNames(): string[] {
		return ['Dropped', 'Hit', 'Init', 'Raised', 'Slingshot', 'Spin', 'Timer', 'Unhit']
	}
}
