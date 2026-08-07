// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { Vertex2D } from '../../math/vertex2d.js'
import { Enums } from '../enums.js'
import { ItemData } from '../item-data.js'

/** Gate data. */
export class GateData extends ItemData {
	public angleMax: number = Math.PI / 2.0
	public angleMin: number = 0
	public damping: number = 0.985
	public elasticity: number = 0.3
	public friction: number = 0.02
	public gateType: number = Enums.GateType.GateWireW
	public gravityFactor: number = 0.25
	public height: number = 50
	public isCollidable: boolean = true
	public isReflectionEnabled: boolean = true
	public isVisible: boolean = true
	public length: number = 100
	public rotation: number = -90
	public showBracket: boolean = true
	public szMaterial?: string
	public szSurface?: string
	public twoWay: boolean = false
	public center!: Vertex2D

	public static async fromStorage(storage: Storage, itemName: string): Promise<GateData> {
		const gateData = new GateData(itemName)
		await storage.streamFiltered(itemName, 4, BiffParser.stream(gateData.fromTag.bind(gateData), {}))
		return gateData
	}

	public constructor(itemName: string) {
		super(itemName)
	}

	private async fromTag(buffer: Uint8Array, tag: string, offset: number, len: number): Promise<number> {
		switch (tag) {
			case 'GATY':
				this.gateType = this.getInt(buffer)
				/* istanbul ignore if: Legacy format */
				if (this.gateType < Enums.GateType.GateWireW || this.gateType > Enums.GateType.GateLongPlate) {
					// for tables that were saved in the phase where m_type could've been undefined
					this.gateType = Enums.GateType.GateWireW
				}
				break
			case 'VCEN':
				this.center = Vertex2D.get(buffer)
				break
			case 'LGTH':
				this.length = this.getFloat(buffer)
				break
			case 'HGTH':
				this.height = this.getFloat(buffer)
				break
			case 'ROTA':
				this.rotation = this.getFloat(buffer)
				break
			case 'MATR':
				this.szMaterial = this.getString(buffer, len)
				break
			case 'GSUP':
				this.showBracket = this.getBool(buffer)
				break
			case 'GCOL':
				this.isCollidable = this.getBool(buffer)
				break
			case 'TWWA':
				this.twoWay = this.getBool(buffer)
				break
			case 'GVSB':
				this.isVisible = this.getBool(buffer)
				break
			case 'REEN':
				this.isReflectionEnabled = this.getBool(buffer)
				break
			case 'SURF':
				this.szSurface = this.getString(buffer, len)
				break
			case 'ELAS':
				this.elasticity = this.getFloat(buffer)
				break
			case 'GAMA':
				this.angleMax = this.getFloat(buffer)
				break
			case 'GAMI':
				this.angleMin = this.getFloat(buffer)
				break
			case 'GFRC':
				this.friction = this.getFloat(buffer)
				break
			case 'AFRC':
				this.damping = this.getFloat(buffer)
				break
			case 'GGFC':
				this.gravityFactor = this.getFloat(buffer)
				break
			default:
				this.getCommonBlock(buffer, tag, len)
				break
		}
		return 0
	}
}
