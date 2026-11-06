// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { Vertex2D } from '../../math/vector.js'
import { type BiffFieldMap, handleBiffTag } from '../biff-helper.js'
import { Enums } from '../enums.js'
import { Item } from '../item.js'
import { ItemData } from '../item-data.js'

const FLOAT_MAP: BiffFieldMap<DecalData, number> = { WDTH: 'width', HIGH: 'height', ROTA: 'rotation' }
const INT_MAP: BiffFieldMap<DecalData, number> = { TYPE: 'decalType', SIZE: 'sizingType' }
const BOOL_MAP: BiffFieldMap<DecalData, boolean> = { VERT: 'verticalText', BGLS: 'isBackglass' }
const STRING_MAP: BiffFieldMap<DecalData, string> = {
	IMAG: 'szImage',
	SURF: 'szSurface',
	TEXT: 'text',
	MATR: 'szMaterial',
}

/** @see https://github.com/vpinball/vpinball/blob/master/src/parts/decal.cpp */
export class DecalData extends ItemData {
	public center!: Vertex2D
	public width = 100
	public height = 100
	public rotation = 0
	public szImage?: string
	public szSurface?: string
	public text?: string
	public decalType: number = Enums.DecalType.DecalImage
	public sizingType: number = Enums.SizingType.ManualSize
	public color = 0x000000
	public szMaterial?: string
	public verticalText = false
	public font = ''
	/** Backglass placement flag (upstream `m_desktopBackdrop`, `BGLS` tag). */
	public isBackglass = false

	public static async fromStorage(storage: Storage, itemName: string): Promise<DecalData> {
		const data = new DecalData(itemName)
		await storage.streamFiltered(itemName, 4, BiffParser.stream(data.fromTag.bind(data)))
		return data
	}

	private constructor(itemName: string) {
		super(itemName)
	}

	private async fromTag(buffer: Uint8Array, tag: string, _offset: number, len: number): Promise<number> {
		if (tag === 'VCEN') {
			this.center = Vertex2D.get(buffer)
			return 0
		}
		if (tag === 'COLR') {
			this.color = BiffParser.bgrToRgb(this.getInt(buffer))
			return 0
		}
		// Deliberately skipped: no renderer consumes decal fonts yet, so there is no
		// font-object model to parse the descriptor into (upstream keeps an IFontDisp).
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

export class Decal extends Item<DecalData> {
	public static async fromStorage(storage: Storage, itemName: string): Promise<Decal> {
		const data = await DecalData.fromStorage(storage, itemName)
		return new Decal(data)
	}

	private constructor(data: DecalData) {
		super(data)
	}
}
