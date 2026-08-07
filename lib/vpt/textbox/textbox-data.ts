// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { Vertex2D } from '../../util/math.js'
import { handleBiffTag } from '../biff-helper.js'
import { Enums } from '../enums.js'
import { ItemData } from '../item-data.js'

const FLOAT_MAP: Record<string, string> = { INSC: 'intensityScale' }
const INT_MAP: Record<string, string> = { ALGN: 'align' }
const BOOL_MAP: Record<string, string> = { TRNS: 'isTransparent', IDMD: 'isDMD' }
const STRING_MAP: Record<string, string> = { TEXT: 'text' }

/** Textbox data. @see https://github.com/vpinball/vpinball/blob/master/textbox.cpp */
export class TextboxData extends ItemData {
	public v1!: Vertex2D
	public v2!: Vertex2D
	public backColor = 0x000000
	public fontColor = 0xffffff
	public intensityScale = 1
	public text = '0'
	public align: number = Enums.TextAlignment.TextAlignRight
	public isTransparent = false
	public isDMD = false
	public isVisible = true

	public static async fromStorage(storage: Storage, itemName: string): Promise<TextboxData> {
		const d = new TextboxData(itemName)
		await storage.streamFiltered(itemName, 4, BiffParser.stream(d.fromTag.bind(d), { streamedTags: ['FONT'] }))
		return d
	}

	private constructor(itemName: string) {
		super(itemName)
	}

	private async fromTag(buffer: Uint8Array, tag: string, _offset: number, len: number): Promise<number> {
		if (tag === 'VER1') {
			this.v1 = Vertex2D.get(buffer)
			return 0
		}
		if (tag === 'VER2') {
			this.v2 = Vertex2D.get(buffer)
			return 0
		}
		if (tag === 'CLRB') {
			this.backColor = BiffParser.bgrToRgb(this.getInt(buffer))
			return 0
		}
		if (tag === 'CLRF') {
			this.fontColor = BiffParser.bgrToRgb(this.getInt(buffer))
			return 0
		}
		if (tag === 'FONT') return 0
		if (
			handleBiffTag(this, tag, buffer, len, {
				float: FLOAT_MAP,
				int: INT_MAP,
				bool: BOOL_MAP,
				string: STRING_MAP,
			})
		)
			return 0
		this.getCommonBlock(buffer, tag, len)
		return 0
	}
}
