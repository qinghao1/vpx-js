// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EventProxy } from '../../game/event-proxy.js'
import type { IScriptable } from '../../game/iscriptable.js'
import type { Player } from '../../game/player.js'
import type { Storage } from '../../io/ole-doc.js'
import { Item } from '../item.js'
import type { Table } from '../table/table.js'
import { DispReelApi } from './dispreel-api.js'
import { DispReelData } from './dispreel-data.js'

export /** Runtime disp reel. */
class DispReel extends Item<DispReelData> implements IScriptable<DispReelApi> {
	private api?: DispReelApi

	public static async fromStorage(storage: Storage, itemName: string): Promise<DispReel> {
		const data = await DispReelData.fromStorage(storage, itemName)
		return new DispReel(data)
	}

	private constructor(data: DispReelData) {
		super(data)
	}

	public setupPlayer(player: Player, table: Table): void {
		this.events = new EventProxy(this)
		this.api = new DispReelApi(this.data, this.events, player, table)
	}

	public getApi(): DispReelApi {
		return this.api!
	}

	public getEventNames(): string[] {
		return ['Init', 'Timer']
	}
}
