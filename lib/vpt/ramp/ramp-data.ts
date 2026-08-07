// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { DragPoint } from '../../math/dragpoint.js'
import { f4 } from '../../math/float.js'
import { handleBiffTag } from '../biff-helper.js'
import { Enums } from '../enums.js'
import { type IPhysicalData, ItemData } from '../item-data.js'

const FLOAT_MAP: Record<string, string> = {
	HTBT: 'heightBottom',
	HTTP: 'heightTop',
	WDBT: 'widthBottom',
	WDTP: 'widthTop',
	WLHL: 'leftWallHeight',
	WLHR: 'rightWallHeight',
	WVHL: 'leftWallHeightVisible',
	WVHR: 'rightWallHeightVisible',
	THRS: 'threshold',
	ELAS: 'elasticity',
	RFCT: 'friction',
	RSCT: 'scatter',
	RADB: 'depthBias',
	RADI: 'wireDiameter',
	RADX: 'wireDistanceX',
	RADY: 'wireDistanceY',
}
const BOOL_MAP: Record<string, string> = {
	IMGW: 'imageWalls',
	HTEV: 'hitEvent',
	CLDR: 'isCollidable',
	RVIS: 'isVisible',
	REEN: 'isReflectionEnabled',
	OVPH: 'overwritePhysics',
}
const STRING_MAP: Record<string, string> = { MATR: 'szMaterial', IMAG: 'szImage', MAPH: 'szPhysicsMaterial' }

/** Ramp data.
 * @see https://github.com/vpinball/vpinball/blob/master/ramp.cpp */
export class RampData extends ItemData implements IPhysicalData {
	public depthBias = 0
	public dragPoints: DragPoint[] = []
	public elasticity!: number
	public friction!: number
	public hitEvent = false
	public heightBottom = 0
	public heightTop = f4(50)
	public imageAlignment: number = Enums.RampImageAlignment.ImageModeWorld
	public imageWalls = true
	public isCollidable = true
	public isReflectionEnabled = true
	public isVisible = true
	public leftWallHeight = f4(62)
	public leftWallHeightVisible = f4(30)
	public overwritePhysics = true
	public rampType: number = Enums.RampType.RampTypeFlat
	public rightWallHeight = f4(62)
	public rightWallHeightVisible = f4(30)
	public scatter!: number
	public szImage?: string
	public szMaterial?: string
	public szPhysicsMaterial?: string
	public threshold?: number
	public widthBottom = f4(75)
	public widthTop = f4(60)
	public wireDiameter = f4(8)
	public wireDistanceX = f4(38)
	public wireDistanceY = f4(88)

	public static async fromStorage(storage: Storage, itemName: string): Promise<RampData> {
		const d = new RampData(itemName)
		await storage.streamFiltered(itemName, 4, RampData.createStreamHandler(d))
		if (d.widthTop === 0 && d.widthBottom > 0) d.widthTop = 0.1
		if (d.widthBottom === 0 && d.widthTop > 0) d.widthBottom = 0.1
		return d
	}

	private static createStreamHandler(d: RampData) {
		d.dragPoints = []
		return BiffParser.stream(d.fromTag.bind(d), {
			nestedTags: {
				DPNT: {
					onStart: () => new DragPoint(),
					onTag: (dp) => dp.fromTag.bind(dp),
					onEnd: (dp) => d.dragPoints.push(dp),
				},
			},
		})
	}

	public constructor(itemName: string) {
		super(itemName)
	}

	private async fromTag(buffer: Uint8Array, tag: string, _offset: number, len: number): Promise<number> {
		if (tag === 'TYPE') {
			this.rampType = this.getInt(buffer)
			return 0
		}
		if (tag === 'ALGN') {
			this.imageAlignment = this.getInt(buffer)
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
