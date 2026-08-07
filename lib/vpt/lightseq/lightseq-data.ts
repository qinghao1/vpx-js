// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { Vertex2D } from '../../math/vertex2d.js'
import { ItemData } from '../item-data.js'

/** LightSeq data.
 * @see https://github.com/vpinball/vpinball/blob/master/lightseq.cpp */
export class LightSeqData extends ItemData {
	private v!: Vertex2D
	public collection?: string
	public center: Vertex2D = new Vertex2D()
	public updateInterval = 25
	private backglass = false

	public static async fromStorage(storage: Storage, itemName: string): Promise<LightSeqData> {
		const d = new LightSeqData(itemName)
		await storage.streamFiltered(itemName, 4, BiffParser.stream(d.fromTag.bind(d), { streamedTags: ['FONT'] }))
		return d
	}

	private constructor(itemName: string) {
		super(itemName)
	}

	private async fromTag(buffer: Uint8Array, tag: string, offset: number, len: number): Promise<number> {
		if (tag === 'VCEN') {
			this.v = Vertex2D.get(buffer)
			return 0
		}
		if (tag === 'COLC') {
			this.collection = this.getWideString(buffer, len)
			return 0
		}
		if (tag === 'UPTM') {
			this.updateInterval = this.getInt(buffer)
			return 0
		}
		if (tag === 'BGLS') {
			this.backglass = this.getBool(buffer)
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
		this.getCommonBlock(buffer, tag, len)
		return 0
	}
}
