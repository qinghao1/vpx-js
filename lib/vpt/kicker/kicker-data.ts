// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { Vertex2D } from '../../math/vertex2d.js'
import { Enums } from '../enums.js'
import { ItemData } from '../item-data.js'

/** Kicker data. */
export class KickerData extends ItemData {
	public kickerType: number = Enums.KickerType.KickerHole
	public center!: Vertex2D
	public radius: number = 25
	public scatter: number = 0.0
	public hitAccuracy: number = 0.7
	public hitHeight: number = 40.0
	public orientation: number = 0.0
	public szMaterial?: string
	public szSurface?: string
	public fallThrough: boolean = false
	public isEnabled: boolean = true
	public legacyMode: boolean = false

	public static async fromStorage(storage: Storage, itemName: string): Promise<KickerData> {
		const kickerData = new KickerData(itemName)
		await storage.streamFiltered(itemName, 4, BiffParser.stream(kickerData.fromTag.bind(kickerData), {}))
		return kickerData
	}

	public constructor(itemName: string) {
		super(itemName)
	}

	private async fromTag(buffer: Uint8Array, tag: string, offset: number, len: number): Promise<number> {
		switch (tag) {
			case 'VCEN':
				this.center = Vertex2D.get(buffer)
				break
			case 'RADI':
				this.radius = this.getFloat(buffer)
				break
			case 'KSCT':
				this.scatter = this.getFloat(buffer)
				break
			case 'KHAC':
				this.hitAccuracy = this.getFloat(buffer)
				break
			case 'KHHI':
				this.hitHeight = this.getFloat(buffer)
				break
			case 'KORI':
				this.orientation = this.getFloat(buffer)
				break
			case 'MATR':
				this.szMaterial = this.getString(buffer, len)
				break
			case 'EBLD':
				this.isEnabled = this.getBool(buffer)
				break
			case 'TYPE':
				this.kickerType = this.getInt(buffer)
				/* istanbul ignore if: legacy handling */
				if (this.kickerType > Enums.KickerType.KickerCup2) {
					this.kickerType = Enums.KickerType.KickerInvisible
				}
				break
			case 'SURF':
				this.szSurface = this.getString(buffer, len)
				break
			case 'FATH':
				this.fallThrough = this.getBool(buffer)
				break
			case 'LEMO':
				this.legacyMode = this.getBool(buffer)
				break
			default:
				this.getCommonBlock(buffer, tag, len)
				break
		}
		return 0
	}
}
