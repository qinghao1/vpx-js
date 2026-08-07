// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EventProxy } from '../../game/event-proxy.js'
import type { IScriptable } from '../../game/iscriptable.js'
import type { Player } from '../../game/player.js'
import type { Storage } from '../../io/ole-doc.js'
import { Item } from '../item.js'
import type { Table } from '../table/table.js'
import { LightSeqApi } from './lightseq-api.js'
import { LightSeqData } from './lightseq-data.js'

export /** Runtime light sequencer. */
class LightSeq extends Item<LightSeqData> implements IScriptable<LightSeqApi> {
	private api?: LightSeqApi

	public static async fromStorage(storage: Storage, itemName: string): Promise<LightSeq> {
		const data = await LightSeqData.fromStorage(storage, itemName)
		return new LightSeq(data)
	}

	private constructor(data: LightSeqData) {
		super(data)
	}

	public setupPlayer(player: Player, table: Table): void {
		this.events = new EventProxy(this)
		this.api = new LightSeqApi(this.data, this.events, player, table)
	}

	public getApi(): LightSeqApi {
		return this.api!
	}

	public getEventNames(): string[] {
		return ['Init', 'PlayDone', 'Timer']
	}
}
