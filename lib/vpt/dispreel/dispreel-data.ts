// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { Vertex2D } from '../../util/math.js'
import { ItemData } from '../item-data.js'

const FLOAT_MAP: Record<string, string> = { WDTH: 'width', HIGH: 'height', RSPC: 'reelSpacing' }
const INT_MAP: Record<string, string> = { GIPR: 'imagesPerGridRow', UPTM: 'updateInterval' }
const BOOL_MAP: Record<string, string> = { TRNS: 'isTransparent', VISI: 'isVisible', UGRD: 'useImageGrid' }
const STRING_MAP: Record<string, string> = { IMAG: 'szImage', SOUN: 'szSound' }

/** DispReel data.
 * @see https://github.com/vpinball/vpinball/blob/master/dispreel.cpp */
export class DispReelData extends ItemData {
	public v1!: Vertex2D
	public v2!: Vertex2D
	public width = 30
	public height = 40
	public backColor = 0x404040
	public isTransparent = false
	public isVisible = true
	public szImage?: string
	public reelCount = 5
	public reelSpacing = 4
	public motorSteps = 2
	public szSound?: string
	public useImageGrid = false
	public imagesPerGridRow = 1
	public digitRange = 9
	public updateInterval = 50

	public static async fromStorage(storage: Storage, itemName: string): Promise<DispReelData> {
		const d = new DispReelData(itemName)
		await storage.streamFiltered(itemName, 4, BiffParser.stream(d.fromTag.bind(d), { streamedTags: ['FONT'] }))
		return d
	}

	private constructor(itemName: string) {
		super(itemName)
	}

	private async fromTag(buffer: Uint8Array, tag: string, offset: number, len: number): Promise<number> {
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
		if (tag === 'RCNT') {
			this.reelCount = Math.floor(this.getFloat(buffer))
			return 0
		}
		if (tag === 'MSTP') {
			this.motorSteps = Math.floor(this.getFloat(buffer))
			return 0
		}
		if (tag === 'RANG') {
			this.digitRange = Math.floor(this.getFloat(buffer))
			return 0
		}
		if (tag === 'FONT') return 0
		if (tag in FLOAT_MAP) {
			;(this as unknown as Record<string, unknown>)[FLOAT_MAP[tag]] = this.getFloat(buffer)
			return 0
		}
		if (tag in INT_MAP) {
			;(this as unknown as Record<string, unknown>)[INT_MAP[tag]] = this.getInt(buffer)
			return 0
		}
		if (tag in BOOL_MAP) {
			;(this as unknown as Record<string, unknown>)[BOOL_MAP[tag]] = this.getBool(buffer)
			return 0
		}
		if (tag in STRING_MAP) {
			;(this as unknown as Record<string, unknown>)[STRING_MAP[tag]] = this.getString(buffer, len)
			return 0
		}
		this.getCommonBlock(buffer, tag, len)
		return 0
	}

	public getBoxWidth(): number {
		return this.reelCount * this.width + this.reelCount * this.reelSpacing + this.reelSpacing
	}

	public getBoxHeight(): number {
		return this.height + this.reelSpacing * 2
	}
}
