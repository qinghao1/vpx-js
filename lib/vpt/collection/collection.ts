// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EventProxy } from '../../game/event-proxy.js'
import type { IPlayable } from '../../game/iplayable.js'
import type { IScriptable } from '../../game/iscriptable.js'
import type { Player } from '../../game/player.js'
import type { Storage } from '../../io/ole-doc.js'
import { Item } from '../item.js'
import type { ItemApi } from '../item-api.js'
import type { ItemData } from '../item-data.js'
import type { Table } from '../table/table.js'
import { CollectionApi } from './collection-api.js'
import { CollectionData } from './collection-data.js'

export /** Collection. */
class Collection extends Item<CollectionData> implements IPlayable, IScriptable<CollectionApi> {
	public readonly items: Array<ItemApi<ItemData>> = [] // m_visel
	private api?: CollectionApi

	// public props
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
