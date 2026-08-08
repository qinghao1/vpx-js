// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { ItemApi } from '../item-api.js'
import type { TimerData } from './timer-data.js'

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
