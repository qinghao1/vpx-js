// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { Vertex2D } from '../../math/vector.js'
import { type BiffFieldMap, handleBiffTag } from '../biff-helper.js'
import { Item } from '../item.js'
import { ItemData } from '../item-data.js'

const FLOAT_MAP: BiffFieldMap<DispReelData, number> = { WDTH: 'width', HIGH: 'height', RSPC: 'reelSpacing' }
const INT_MAP: BiffFieldMap<DispReelData, number> = { GIPR: 'imagesPerGridRow' }
const BOOL_MAP: BiffFieldMap<DispReelData, boolean> = { VISI: 'isVisible', UGRD: 'useImageGrid' }
const STRING_MAP: BiffFieldMap<DispReelData, string> = { IMAG: 'szImage' }

/**
 * EM score reel on the desktop backdrop (1000x750 backdrop space). Layout
 * only: the engine rolls the digits (`DispReel::UpdateAnimation`) and the
 * bridge publishes them per frame (reels buffer).
 * @see https://github.com/vpinball/vpinball/blob/master/src/parts/dispreel.cpp
 */
export class DispReelData extends ItemData {
	public v1 = new Vertex2D()
	public width = 30
	public height = 40
	public reelCount = 5
	public reelSpacing = 4
	public digitRange = 9
	public useImageGrid = false
	public imagesPerGridRow = 1
	public isVisible = true
	public szImage?: string

	public static async fromStorage(storage: Storage, itemName: string): Promise<DispReelData> {
		const data = new DispReelData(itemName)
		await storage.streamFiltered(itemName, 4, BiffParser.stream(data.fromTag.bind(data)))
		return data
	}

	private constructor(itemName: string) {
		super(itemName)
	}

	private async fromTag(buffer: Uint8Array, tag: string, _offset: number, len: number): Promise<number> {
		// Upstream stores these counts as floats and truncates on load.
		if (tag === 'VER1') this.v1 = Vertex2D.get(buffer)
		else if (tag === 'RCNT') this.reelCount = Math.trunc(this.getFloat(buffer))
		else if (tag === 'RANG') this.digitRange = Math.trunc(this.getFloat(buffer))
		else if (
			!handleBiffTag(this, tag, buffer, len, {
				float: FLOAT_MAP,
				int: INT_MAP,
				bool: BOOL_MAP,
				string: STRING_MAP,
			})
		)
			this.getCommonBlock(buffer, tag, len)
		return 0
	}
}

export class DispReel extends Item<DispReelData> {
	public static async fromStorage(storage: Storage, itemName: string): Promise<DispReel> {
		return new DispReel(await DispReelData.fromStorage(storage, itemName))
	}
}
