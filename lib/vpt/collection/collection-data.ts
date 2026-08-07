// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { ItemData } from '../item-data.js'

const BOOL_MAP: Record<string, string> = { EVNT: 'fireEvents', SSNG: 'stopSingleEvents', GREL: 'groupElements' }

/** Collection data.
 * @see https://github.com/vpinball/vpinball/blob/master/collection.cpp */
export class CollectionData extends ItemData {
	public itemNames: string[] = []
	public fireEvents = false
	public groupElements = true
	public stopSingleEvents = false

	public static async fromStorage(storage: Storage, itemName: string): Promise<CollectionData> {
		const d = new CollectionData(itemName)
		await storage.streamFiltered(itemName, 0, BiffParser.stream(d.fromTag.bind(d)))
		return d
	}

	private constructor(itemName: string) {
		super(itemName)
	}

	private async fromTag(buffer: Uint8Array, tag: string, offset: number, len: number): Promise<number> {
		if (tag === 'ITEM') {
			this.itemNames.push(this.getWideString(buffer, len))
			return 0
		}
		if (tag in BOOL_MAP) {
			;(this as unknown as Record<string, unknown>)[BOOL_MAP[tag]] = this.getBool(buffer)
			return 0
		}
		this.getCommonBlock(buffer, tag, len)
		return 0
	}
}
