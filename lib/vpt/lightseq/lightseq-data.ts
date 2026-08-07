// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { Vertex2D } from '../../math/vertex2d.js'
import { ItemData } from '../item-data.js'

export /** LightSeq data. */
class LightSeqData extends ItemData {
	private v!: Vertex2D
	public collection?: string
	public center: Vertex2D = new Vertex2D()
	public updateInterval: number = 25
	private backglass: boolean = false

	public static async fromStorage(storage: Storage, itemName: string): Promise<LightSeqData> {
		const lightSeqData = new LightSeqData(itemName)
		await storage.streamFiltered(
			itemName,
			4,
			BiffParser.stream(lightSeqData.fromTag.bind(lightSeqData), {
				streamedTags: ['FONT'],
			}),
		)
		return lightSeqData
	}

	private constructor(itemName: string) {
		super(itemName)
	}

	private async fromTag(buffer: Uint8Array, tag: string, offset: number, len: number): Promise<number> {
		switch (tag) {
			case 'VCEN':
				this.v = Vertex2D.get(buffer)
				break
			case 'COLC':
				this.collection = this.getWideString(buffer, len)
				break
			case 'CTRX':
				this.center.x = this.getFloat(buffer)
				break
			case 'CTRY':
				this.center.y = this.getFloat(buffer)
				break
			case 'UPTM':
				this.updateInterval = this.getInt(buffer)
				break
			case 'BGLS':
				this.backglass = this.getBool(buffer)
				break
			default:
				this.getCommonBlock(buffer, tag, len)
				break
		}
		return 0
	}
}
