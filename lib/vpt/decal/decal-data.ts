// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { Vertex2D } from '../../math/vertex2d.js'
import { Enums } from '../enums.js'
import { ItemData } from '../item-data.js'

export /** Decal data. */
class DecalData extends ItemData {
	public center!: Vertex2D
	public width: number = 100.0
	public height: number = 100.0
	public rotation: number = 0.0
	public szImage?: string
	public szSurface?: string
	public text?: string
	public decalType: number = Enums.DecalType.DecalImage
	public sizingType: number = Enums.SizingType.ManualSize
	public color: number = 0x000000
	public szMaterial?: string
	public verticalText: boolean = false
	private backglass: boolean = false

	public font: string = ''

	public static async fromStorage(storage: Storage, itemName: string): Promise<DecalData> {
		const decalData = new DecalData(itemName)
		await storage.streamFiltered(
			itemName,
			4,
			BiffParser.stream(decalData.fromTag.bind(decalData), {
				streamedTags: ['FONT'],
			}),
		)
		return decalData
	}

	private constructor(itemName: string) {
		super(itemName)
	}

	private async fromTag(buffer: Uint8Array, tag: string, offset: number, len: number): Promise<number> {
		switch (tag) {
			case 'VCEN':
				this.center = Vertex2D.get(buffer)
				break
			case 'WDTH':
				this.width = this.getFloat(buffer)
				break
			case 'HIGH':
				this.height = this.getFloat(buffer)
				break
			case 'ROTA':
				this.rotation = this.getFloat(buffer)
				break
			case 'IMAG':
				this.szImage = this.getString(buffer, len)
				break
			case 'SURF':
				this.szSurface = this.getString(buffer, len)
				break
			case 'TEXT':
				this.text = this.getString(buffer, len)
				break
			case 'TYPE':
				this.decalType = this.getInt(buffer)
				break
			case 'SIZE':
				this.sizingType = this.getInt(buffer)
				break
			case 'COLR':
				this.color = BiffParser.bgrToRgb(this.getInt(buffer))
				break
			case 'MATR':
				this.szMaterial = this.getString(buffer, len)
				break
			case 'VERT':
				this.verticalText = this.getBool(buffer)
				break
			case 'BGLS':
				this.backglass = this.getBool(buffer)
				break
			case 'FONT':
				break // don't care for now
			default:
				this.getCommonBlock(buffer, tag, len)
				break
		}
		return 0
	}
}
