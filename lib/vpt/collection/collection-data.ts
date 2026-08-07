// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { ItemData } from '../item-data.js'

/** Collection data.
 *
 * @see https://github.com/vpinball/vpinball/blob/master/collection.cpp */
export class CollectionData extends ItemData {
	public itemNames: string[] = []
	public fireEvents: boolean = false
	public groupElements: boolean = true
	public stopSingleEvents: boolean = false

	public static async fromStorage(storage: Storage, itemName: string): Promise<CollectionData> {
		const collectionData = new CollectionData(itemName)
		await storage.streamFiltered(itemName, 0, BiffParser.stream(collectionData.fromTag.bind(collectionData), {}))
		return collectionData
	}

	private constructor(itemName: string) {
		super(itemName)
	}

	private async fromTag(buffer: Uint8Array, tag: string, offset: number, len: number): Promise<number> {
		switch (tag) {
			case 'EVNT':
				this.fireEvents = this.getBool(buffer)
				break
			case 'SSNG':
				this.stopSingleEvents = this.getBool(buffer)
				break
			case 'GREL':
				this.groupElements = this.getBool(buffer)
				break
			case 'ITEM':
				this.itemNames.push(this.getWideString(buffer, len))
				break
			default:
				this.getCommonBlock(buffer, tag, len)
				break
		}
		return 0
	}
}
