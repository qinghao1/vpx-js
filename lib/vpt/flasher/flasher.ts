// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EventProxy } from '../../game/event-proxy.js'
import type { IScriptable } from '../../game/iscriptable.js'
import type { Player } from '../../game/player.js'
import type { Storage } from '../../io/ole-doc.js'
import { Item } from '../item.js'
import type { Table } from '../table/table.js'
import { FlasherApi } from './flasher-api.js'
import { FlasherData } from './flasher-data.js'

export class Flasher extends Item<FlasherData> implements IScriptable<FlasherApi> {
	private api?: FlasherApi

	public static async fromStorage(storage: Storage, itemName: string): Promise<Flasher> {
		const data = await FlasherData.fromStorage(storage, itemName)
		return new Flasher(data)
	}

	private constructor(data: FlasherData) {
		super(data)
	}

	public setupPlayer(player: Player, table: Table): void {
		this.events = new EventProxy(this)
		this.api = new FlasherApi(this.data, this.events, player, table)
	}

	public getApi(): FlasherApi {
		return this.api!
	}

	public getEventNames(): string[] {
		return ['Init', 'Timer']
	}
}
