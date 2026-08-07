// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EventProxy } from '../../game/event-proxy.js'
import type { IPlayable } from '../../game/iplayable.js'
import type { IScriptable } from '../../game/iscriptable.js'
import type { Player } from '../../game/player.js'
import type { Storage } from '../../io/ole-doc.js'
import { Item } from '../item.js'
import type { Table } from '../table/table.js'
import { TimerApi } from './timer-api.js'
import { TimerData } from './timer-data.js'

/** Runtime timer. */
export class Timer extends Item<TimerData> implements IPlayable, IScriptable<TimerApi> {
	private api?: TimerApi

	public static async fromStorage(storage: Storage, itemName: string): Promise<Timer> {
		const data = await TimerData.fromStorage(storage, itemName)
		return new Timer(data)
	}

	private constructor(data: TimerData) {
		super(data)
	}

	public setupPlayer(player: Player, table: Table): void {
		this.events = new EventProxy(this)
		this.api = new TimerApi(this.data, this.events, player, table)
	}

	public getEventNames(): string[] {
		return ['Init', 'Timer']
	}

	public getApi(): TimerApi {
		return this.api!
	}
}
