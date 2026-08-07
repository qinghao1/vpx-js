// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EventProxy } from '../../game/event-proxy.js'
import type { IScriptable } from '../../game/iscriptable.js'
import type { Player } from '../../game/player.js'
import type { Storage } from '../../io/ole-doc.js'
import { Item } from '../item.js'
import type { Table } from '../table/table.js'
import { DecalApi } from './decal-api.js'
import { DecalData } from './decal-data.js'

export /** Decal. */
class Decal extends Item<DecalData> implements IScriptable<DecalApi> {
	private api?: DecalApi

	public static async fromStorage(storage: Storage, itemName: string): Promise<Decal> {
		const data = await DecalData.fromStorage(storage, itemName)
		return new Decal(data)
	}

	private constructor(data: DecalData) {
		super(data)
	}

	public setupPlayer(player: Player, table: Table): void {
		this.events = new EventProxy(this)
		this.api = new DecalApi(this.data, this.events, player, table)
	}

	public getApi(): DecalApi {
		return this.api!
	}

	public getEventNames(): string[] {
		return []
	}
}
