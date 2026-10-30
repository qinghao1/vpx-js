// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EventProxy } from '../../game/event-proxy.js'
import type { IAnimatable, IAnimation, IScriptable } from '../../game/interfaces.js'
import type { Player } from '../../game/player.js'
import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { Vertex2D } from '../../math/vector.js'
import { handleBiffTag } from '../biff-helper.js'
import { Item } from '../item.js'
import { ItemApi } from '../item-api.js'
import { ItemData } from '../item-data.js'
import type { Table } from '../table/table.js'
import { LightSeqAnimation } from './lightseq-animation.js'

/** @see https://github.com/vpinball/vpinball/blob/master/lightseq.cpp */
export class LightSeqData extends ItemData {
	public collection?: string
	public center: Vertex2D = new Vertex2D()
	public updateInterval = 25
	/** Backglass placement flag (upstream `m_desktopBackdrop`, `BGLS` tag). */
	public isBackglass = false

	public static async fromStorage(storage: Storage, itemName: string): Promise<LightSeqData> {
		const data = new LightSeqData(itemName)
		await storage.streamFiltered(itemName, 4, BiffParser.stream(data.fromTag.bind(data)))
		return data
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
				bool: { BGLS: 'isBackglass' },
			})
		)
			return 0
		this.getCommonBlock(buffer, tag, len)
		return 0
	}
}

/** LightSeq API — VBS surface for `LightSeq`. @see https://github.com/vpinball/vpinball/blob/master/lightseq.cpp */
export class LightSeqApi extends ItemApi<LightSeqData> {
	constructor(
		data: LightSeqData,
		events: EventProxy,
		player: Player,
		table: Table,
		private readonly animation: LightSeqAnimation,
	) {
		super(data, events, player, table)
	}

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
		this.animation.setCenterX(v)
	}
	get CenterY() {
		return this.data.center.y
	}
	set CenterY(v) {
		this.animation.setCenterY(v)
	}
	get UpdateInterval() {
		return this.data.updateInterval
	}
	set UpdateInterval(v) {
		const rate = Math.trunc(v)
		this.data.updateInterval = rate >= 1 ? rate : 1
	}

	public Play(animation: number, tailLength: number, repeat: number, pause: number): void {
		this.animation.play(animation, tailLength, repeat, pause)
	}
	public StopPlay(): void {
		this.animation.stopPlay()
	}
}

/** Runtime light sequencer. */
export class LightSeq extends Item<LightSeqData> implements IAnimatable, IScriptable<LightSeqApi> {
	private api?: LightSeqApi
	private animation?: LightSeqAnimation

	public static async fromStorage(storage: Storage, itemName: string): Promise<LightSeq> {
		const data = await LightSeqData.fromStorage(storage, itemName)
		return new LightSeq(data)
	}

	private constructor(data: LightSeqData) {
		super(data)
	}

	public setupPlayer(player: Player, table: Table): void {
		this.events = new EventProxy(this)
		this.animation = new LightSeqAnimation(this.data, this.events, player, table)
		this.api = new LightSeqApi(this.data, this.events, player, table, this.animation)
	}

	public getApi(): LightSeqApi {
		return this.api!
	}

	public getAnimation(): IAnimation {
		return this.animation!
	}

	public getEventNames(): string[] {
		return ['Init', 'PlayDone', 'Timer']
	}
}
