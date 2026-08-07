// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { Vertex2D } from '../../math/vertex2d.js'
import { ItemData } from '../item-data.js'

export /** DispReel data. */
class DispReelData extends ItemData {
	public v1!: Vertex2D
	public v2!: Vertex2D
	public width: number = 30.0
	public height: number = 40.0
	public backColor: number = 0x404040
	public isTransparent: boolean = false
	public isVisible: boolean = true
	public szImage?: string
	public reelCount: number = 5
	public reelSpacing: number = 4.0
	public motorSteps: number = 2
	public szSound?: string
	public useImageGrid: boolean = false
	public imagesPerGridRow: number = 1
	public digitRange: number = 9
	public updateInterval: number = 50

	public static async fromStorage(storage: Storage, itemName: string): Promise<DispReelData> {
		const dispReelData = new DispReelData(itemName)
		await storage.streamFiltered(
			itemName,
			4,
			BiffParser.stream(dispReelData.fromTag.bind(dispReelData), {
				streamedTags: ['FONT'],
			}),
		)
		return dispReelData
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
			case 'WDTH':
				this.width = this.getFloat(buffer)
				break
			case 'HIGH':
				this.height = this.getFloat(buffer)
				break
			case 'CLRB':
				this.backColor = BiffParser.bgrToRgb(this.getInt(buffer))
				break
			case 'TRNS':
				this.isTransparent = this.getBool(buffer)
				break
			case 'VISI':
				this.isVisible = this.getBool(buffer)
				break
			case 'IMAG':
				this.szImage = this.getString(buffer, len)
				break
			case 'RCNT':
				this.reelCount = Math.floor(this.getFloat(buffer))
				break
			case 'RSPC':
				this.reelSpacing = this.getFloat(buffer)
				break
			case 'MSTP':
				this.motorSteps = Math.floor(this.getFloat(buffer))
				break
			case 'SOUN':
				this.szSound = this.getString(buffer, len)
				break
			case 'UGRD':
				this.useImageGrid = this.getBool(buffer)
				break
			case 'GIPR':
				this.imagesPerGridRow = this.getInt(buffer)
				break
			case 'RANG':
				this.digitRange = Math.floor(this.getFloat(buffer))
				break
			case 'UPTM':
				this.updateInterval = this.getInt(buffer)
				break
			case 'FONT':
				break // don't care for now
			default:
				this.getCommonBlock(buffer, tag, len)
				break
		}
		return 0
	}

	public getBoxWidth(): number {
		return this.reelCount * this.width + this.reelCount * this.reelSpacing + this.reelSpacing // spacing also includes edges
	}

	public getBoxHeight(): number {
		return this.height + this.reelSpacing + this.reelSpacing // spacing also includes edges
	}
}
