// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { ItemApi } from '../item-api.js'
import type { LightSeqData } from './lightseq-data.js'

export /** LightSeqApi. */
class LightSeqApi extends ItemApi<LightSeqData> {
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

	public Play(animation: number, tailLength: number, repeat: number, pause: number): void {
		// TODO implement
	}

	public StopPlay(): void {
		// TODO implement
	}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(LightSeqApi.prototype)
	}
}
