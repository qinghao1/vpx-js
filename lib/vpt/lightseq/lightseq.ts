// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EventProxy } from '../../game/event-proxy.js'
import type { IScriptable } from '../../game/iscriptable.js'
import type { Player } from '../../game/player.js'
import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { Vertex2D } from '../../util/vector.js'
import { handleBiffTag } from '../biff-helper.js'
import { Item } from '../item.js'
import { ItemApi } from '../item-api.js'
import { ItemData } from '../item-data.js'
import type { Table } from '../table/table.js'

/** LightSeq data.
 * @see https://github.com/vpinball/vpinball/blob/master/lightseq.cpp */
export class LightSeqData extends ItemData {
	public collection?: string
	public center: Vertex2D = new Vertex2D()
	public updateInterval = 25

	public static async fromStorage(storage: Storage, itemName: string): Promise<LightSeqData> {
		const d = new LightSeqData(itemName)
		await storage.streamFiltered(itemName, 4, BiffParser.stream(d.fromTag.bind(d), { streamedTags: ['FONT'] }))
		return d
	}

	private constructor(itemName: string) {
		super(itemName)
	}

	private async fromTag(buffer: Uint8Array, tag: string, _offset: number, len: number): Promise<number> {
		if (tag === 'VCEN') {
			this.center = Vertex2D.get(buffer)
			return 0
		}
		if (tag === 'COLC') {
			this.collection = this.getWideString(buffer, len)
			return 0
		}
		if (tag === 'CTRX') {
			this.center.x = this.getFloat(buffer)
			return 0
		}
		if (tag === 'CTRY') {
			this.center.y = this.getFloat(buffer)
			return 0
		}
		if (
			handleBiffTag(this, tag, buffer, len, {
				int: { UPTM: 'updateInterval' },
			})
		)
			return 0
		this.getCommonBlock(buffer, tag, len)
		return 0
	}
}

/** LightSeq API — VBS surface for `LightSeq`. @see https://github.com/vpinball/vpinball/blob/master/lightseq.cpp */
export class LightSeqApi extends ItemApi<LightSeqData> {
	get Collection() {
		return this.data.collection
	}
	set Collection(v) {
		this.data.collection = v
	}
	get CenterX() {
		return this.data.center.x
	}
	set CenterX(v) {
		this.data.center.x = v
	}
	get CenterY() {
		return this.data.center.y
	}
	set CenterY(v) {
		this.data.center.y = v
	}
	get UpdateInterval() {
		return this.data.updateInterval
	}
	set UpdateInterval(v) {
		this.data.updateInterval = v
	}

	public Play(_animation: number, _tailLength: number, _repeat: number, _pause: number): void {}
	public StopPlay(): void {}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(LightSeqApi.prototype)
	}
}

/** Runtime light sequencer. */
export class LightSeq extends Item<LightSeqData> implements IScriptable<LightSeqApi> {
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
