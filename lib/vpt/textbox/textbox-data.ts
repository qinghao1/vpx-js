// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { Vertex2D } from '../../math/vertex2d.js'
import { Enums } from '../enums.js'
import { ItemData } from '../item-data.js'

export /** Textbox data. */
class TextboxData extends ItemData {
	public v1!: Vertex2D
	public v2!: Vertex2D
	public backColor: number = 0x000000
	public fontColor: number = 0xffffff
	public intensityScale: number = 1.0
	public text: string = '0'
	public align: number = Enums.TextAlignment.TextAlignRight
	public isTransparent: boolean = false
	public isDMD: boolean = false

	// non-persisted
	public isVisible: boolean = true

	public static async fromStorage(storage: Storage, itemName: string): Promise<TextboxData> {
		const textBoxData = new TextboxData(itemName)
		await storage.streamFiltered(
			itemName,
			4,
			BiffParser.stream(textBoxData.fromTag.bind(textBoxData), {
				streamedTags: ['FONT'],
			}),
		)
		return textBoxData
	}

	private constructor(itemName: string) {
		super(itemName)
	}

	private async fromTag(buffer: Uint8Array, tag: string, offset: number, len: number): Promise<number> {
		switch (tag) {
			case 'VER1':
				this.v1 = Vertex2D.get(buffer)
				break
			case 'VER2':
				this.v2 = Vertex2D.get(buffer)
				break
			case 'CLRB':
				this.backColor = BiffParser.bgrToRgb(this.getInt(buffer))
				break
			case 'CLRF':
				this.fontColor = BiffParser.bgrToRgb(this.getInt(buffer))
				break
			case 'INSC':
				this.intensityScale = this.getFloat(buffer)
				break
			case 'TEXT':
				this.text = this.getString(buffer, len)
				break
			case 'ALGN':
				this.align = this.getInt(buffer)
				break
			case 'TRNS':
				this.isTransparent = this.getBool(buffer)
				break
			case 'IDMD':
				this.isDMD = this.getBool(buffer)
				break
			case 'FONT':
				break // ignore for now, see BiffParser#L62, it's currently treated as end of storage
			default:
				this.getCommonBlock(buffer, tag, len)
				break
		}
		return 0
	}
}
