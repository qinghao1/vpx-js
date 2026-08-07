// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { Vertex2D } from '../../util/math.js'
import { handleBiffTag } from '../biff-helper.js'
import { Enums } from '../enums.js'
import { ItemData } from '../item-data.js'

const FLOAT_MAP: Record<string, string> = {
	WDTH: 'width',
	ZADJ: 'zAdjust',
	HIGH: 'height',
	HPSL: 'stroke',
	SPDP: 'speedPull',
	SPDF: 'speedFire',
	MEST: 'mechStrength',
	MPRK: 'parkPosition',
	PSCV: 'scatterVelocity',
	MOMX: 'momentumXfer',
	RODD: 'rodDiam',
	RNGG: 'ringGap',
	RNGD: 'ringDiam',
	RNGW: 'ringWidth',
	SPRD: 'springDiam',
	SPRG: 'springGauge',
	SPRL: 'springLoops',
	SPRE: 'springEndLoops',
}
const BOOL_MAP: Record<string, string> = {
	MECH: 'mechPlunger',
	APLG: 'autoPlunger',
	VSBL: 'isVisible',
	REEN: 'isReflectionEnabled',
}
const STRING_MAP: Record<string, string> = {
	MATR: 'szMaterial',
	IMAG: 'szImage',
	SURF: 'szSurface',
	TIPS: 'szTipShape',
}

/** Plunger data.
 * @see https://github.com/vpinball/vpinball/blob/master/plunger.cpp */
export class PlungerData extends ItemData {
	public type: number = Enums.PlungerType.PlungerTypeModern
	public center!: Vertex2D
	public width = 25
	public height = 20
	public zAdjust = this.height * 4
	public color = 0x4c4c4c
	public stroke?: number
	public speedPull = 0.5
	public speedFire = 80
	public mechStrength = 85
	public parkPosition = 0.5 / 3.0
	public scatterVelocity = 0
	public momentumXfer = 1
	public mechPlunger = false
	public autoPlunger = false
	public animFrames?: number
	public szMaterial?: string
	public szImage?: string
	public isVisible = true
	public isReflectionEnabled = true
	public szSurface?: string
	public szTipShape = '0 .34; 2 .6; 3 .64; 5 .7; 7 .84; 8 .88; 9 .9; 11 .92; 14 .92; 39 .84'
	public rodDiam = 0.6
	public ringGap = 2.0
	public ringDiam = 0.94
	public ringWidth = 3.0
	public springDiam = 0.77
	public springGauge = 1.38
	public springLoops = 8.0
	public springEndLoops = 2.5

	public static async fromStorage(storage: Storage, itemName: string): Promise<PlungerData> {
		const d = new PlungerData(itemName)
		await storage.streamFiltered(itemName, 4, BiffParser.stream(d.fromTag.bind(d)))
		return d
	}

	private constructor(itemName: string) {
		super(itemName)
	}

	private async fromTag(buffer: Uint8Array, tag: string, _offset: number, len: number): Promise<number> {
		if (tag === 'VCEN') {
			this.center = Vertex2D.get(buffer)
			return 0
		}
		if (tag === 'TYPE') {
			this.type = this.getInt(buffer)
			return 0
		}
		if (tag === 'ANFR') {
			this.animFrames = this.getInt(buffer)
			return 0
		}
		if (
			handleBiffTag(this as unknown as Record<string, unknown>, this, tag, buffer, len, {
				float: FLOAT_MAP,
				bool: BOOL_MAP,
				string: STRING_MAP,
			})
		)
			return 0
		this.getCommonBlock(buffer, tag, len)
		return 0
	}
}
