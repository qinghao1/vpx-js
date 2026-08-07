// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { Vertex2D } from '../../math/vertex2d.js'
import { Enums } from '../enums.js'
import { ItemData } from '../item-data.js'

/** Plunger data. */
export class PlungerData extends ItemData {
	public type: number = Enums.PlungerType.PlungerTypeModern
	public center!: Vertex2D
	public width: number = 25
	public height: number = 20
	public zAdjust: number = this.height * 4
	public color: number = 0x4c4c4c
	public stroke?: number
	public speedPull: number = 0.5
	public speedFire: number = 80
	public mechStrength: number = 85
	public parkPosition: number = 0.5 / 3.0
	public scatterVelocity: number = 0
	public momentumXfer: number = 1
	public mechPlunger: boolean = false
	public autoPlunger: boolean = false
	public animFrames?: number
	public szMaterial?: string
	public szImage?: string
	public isVisible: boolean = true
	public isReflectionEnabled: boolean = true
	public szSurface?: string
	public szTipShape: string = '0 .34; 2 .6; 3 .64; 5 .7; 7 .84; 8 .88; 9 .9; 11 .92; 14 .92; 39 .84'
	public rodDiam: number = 0.6
	public ringGap: number = 2.0
	public ringDiam: number = 0.94
	public ringWidth: number = 3.0
	public springDiam: number = 0.77
	public springGauge: number = 1.38
	public springLoops: number = 8.0
	public springEndLoops: number = 2.5

	public static async fromStorage(storage: Storage, itemName: string): Promise<PlungerData> {
		const plungerItem = new PlungerData(itemName)
		await storage.streamFiltered(itemName, 4, BiffParser.stream(plungerItem.fromTag.bind(plungerItem), {}))
		return plungerItem
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
			case 'ZADJ':
				this.zAdjust = this.getFloat(buffer)
				break
			case 'HIGH':
				this.height = this.getFloat(buffer)
				break
			case 'HPSL':
				this.stroke = this.getFloat(buffer)
				break
			case 'SPDP':
				this.speedPull = this.getFloat(buffer)
				break
			case 'SPDF':
				this.speedFire = this.getFloat(buffer)
				break
			case 'MEST':
				this.mechStrength = this.getFloat(buffer)
				break
			case 'MPRK':
				this.parkPosition = this.getFloat(buffer)
				break
			case 'PSCV':
				this.scatterVelocity = this.getFloat(buffer)
				break
			case 'MOMX':
				this.momentumXfer = this.getFloat(buffer)
				break
			case 'MECH':
				this.mechPlunger = this.getBool(buffer)
				break
			case 'APLG':
				this.autoPlunger = this.getBool(buffer)
				break
			case 'TYPE':
				this.type = this.getInt(buffer)
				break
			case 'ANFR':
				this.animFrames = this.getInt(buffer)
				break
			case 'MATR':
				this.szMaterial = this.getString(buffer, len)
				break
			case 'IMAG':
				this.szImage = this.getString(buffer, len)
				break
			case 'VSBL':
				this.isVisible = this.getBool(buffer)
				break
			case 'REEN':
				this.isReflectionEnabled = this.getBool(buffer)
				break
			case 'SURF':
				this.szSurface = this.getString(buffer, len)
				break
			case 'TIPS':
				this.szTipShape = this.getString(buffer, len)
				break
			case 'RODD':
				this.rodDiam = this.getFloat(buffer)
				break
			case 'RNGG':
				this.ringGap = this.getFloat(buffer)
				break
			case 'RNGD':
				this.ringDiam = this.getFloat(buffer)
				break
			case 'RNGW':
				this.ringWidth = this.getFloat(buffer)
				break
			case 'SPRD':
				this.springDiam = this.getFloat(buffer)
				break
			case 'SPRG':
				this.springGauge = this.getFloat(buffer)
				break
			case 'SPRL':
				this.springLoops = this.getFloat(buffer)
				break
			case 'SPRE':
				this.springEndLoops = this.getFloat(buffer)
				break
			default:
				this.getCommonBlock(buffer, tag, len)
				break
		}
		return 0
	}
}
