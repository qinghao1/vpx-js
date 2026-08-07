// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { Vertex2D } from '../../math/vertex2d.js'
import { ItemData } from '../item-data.js'

/**
 * VPinball's timers.
 *
 * @see https://github.com/vpinball/vpinball/blob/master/timer.cpp
 */
export class TimerData extends ItemData {
	public vCenter!: Vertex2D
	private isBackglass!: boolean

	public static async fromStorage(storage: Storage, itemName: string): Promise<TimerData> {
		const timerItem = new TimerData(itemName)
		await storage.streamFiltered(itemName, 4, BiffParser.stream(timerItem.fromTag.bind(timerItem), {}))
		return timerItem
	}

	private constructor(itemName: string) {
		super(itemName)
	}

	public isVisible(): boolean {
		return false
	}

	private async fromTag(buffer: Uint8Array, tag: string, offset: number, len: number): Promise<number> {
		switch (tag) {
			case 'VCEN':
				this.vCenter = Vertex2D.get(buffer)
				break
			case 'BGLS':
				this.isBackglass = this.getBool(buffer)
				break
			default:
				this.getCommonBlock(buffer, tag, len)
				break
		}
		return 0
	}
}
