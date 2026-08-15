// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EventProxy } from '../../game/event-proxy.js'
import type { IPlayable } from '../../game/iplayable.js'
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

export {
	MAX_TIMER_MSEC_INTERVAL,
	MAX_TIMERS_MSEC_OVERALL,
	TIMER_DISABLED,
	TimerMode,
} from './timer-const.js'
export { TimerHit } from './timer-hit.js'
export { TimerOnOff } from './timer-on-off.js'

/** VPinball timer data. @see https://github.com/vpinball/vpinball/blob/master/timer.cpp */
export class TimerData extends ItemData {
	public vCenter!: Vertex2D

	public static async fromStorage(storage: Storage, itemName: string): Promise<TimerData> {
		const d = new TimerData(itemName)
		await storage.streamFiltered(itemName, 4, BiffParser.stream(d.fromTag.bind(d)))
		return d
	}

	private constructor(itemName: string) {
		super(itemName)
	}

	public isVisible(): boolean {
		return false
	}

	private async fromTag(buffer: Uint8Array, tag: string, _offset: number, len: number): Promise<number> {
		if (tag === 'VCEN') {
			this.vCenter = Vertex2D.get(buffer)
			return 0
		}
		if (
			handleBiffTag(this, tag, buffer, len, {
				bool: { BGLS: 'isBackglass' },
			})
		)
			return 0
		this.getCommonBlock(buffer, tag, len)
		return 0
	}
}

/** Timer API — VBS surface for `Timer`. @see https://github.com/vpinball/vpinball/blob/master/timer.cpp */
export class TimerApi extends ItemApi<TimerData> {
	get X() {
		return this.data.vCenter.x
	}
	set X(v) {
		this.data.vCenter.x = v
	}
	get Y() {
		return this.data.vCenter.y
	}
	set Y(v) {
		this.data.vCenter.y = v
	}
	get Interval() {
		return this.data.timer.interval
	}
	set Interval(v) {
		this._setTimerInterval(v)
	}
	get Enabled() {
		return this.data.timer.enabled
	}
	set Enabled(v) {
		this._setTimerEnabled(v)
	}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(TimerApi.prototype)
	}
}

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
