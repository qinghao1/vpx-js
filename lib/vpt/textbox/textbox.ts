// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EventProxy } from '../../game/event-proxy.js'
import type { IScriptable } from '../../game/iscriptable.js'
import type { Player } from '../../game/player.js'
import type { Storage } from '../../io/ole-doc.js'
import { Item } from '../item.js'
import type { Table } from '../table/table.js'
import { TextboxApi } from './textbox-api.js'
import { TextboxData } from './textbox-data.js'

export /** Runtime textbox. */
class Textbox extends Item<TextboxData> implements IScriptable<TextboxApi> {
	private api?: TextboxApi

	public static async fromStorage(storage: Storage, itemName: string): Promise<Textbox> {
		const data = await TextboxData.fromStorage(storage, itemName)
		return new Textbox(data)
	}

	private constructor(data: TextboxData) {
		super(data)
	}

	public setupPlayer(player: Player, table: Table): void {
		this.events = new EventProxy(this)
		this.api = new TextboxApi(this.data, this.events, player, table)
	}

	public getApi(): TextboxApi {
		return this.api!
	}

	public getEventNames(): string[] {
		return ['Init', 'Timer']
	}
}
