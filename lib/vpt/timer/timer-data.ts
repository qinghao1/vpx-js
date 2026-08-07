// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { Vertex2D } from '../../math/vertex2d.js'
import { ItemData } from '../item-data.js'

/** VPinball timer.
 * @see https://github.com/vpinball/vpinball/blob/master/timer.cpp */
export class TimerData extends ItemData {
	public vCenter!: Vertex2D
	private isBackglass!: boolean

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

	private async fromTag(buffer: Uint8Array, tag: string, offset: number, len: number): Promise<number> {
		if (tag === 'VCEN') {
			this.vCenter = Vertex2D.get(buffer)
			return 0
		}
		if (tag === 'BGLS') {
			this.isBackglass = this.getBool(buffer)
			return 0
		}
		this.getCommonBlock(buffer, tag, len)
		return 0
	}
}
