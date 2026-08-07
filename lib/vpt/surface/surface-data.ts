// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { DragPoint } from '../../math/dragpoint.js'
import { type IPhysicalData, ItemData } from '../item-data.js'

const BOOL_MAP: Record<string, string> = {
	HTEV: 'hitEvent',
	DROP: 'isDroppable',
	FLIP: 'isFlipbook',
	ISBS: 'isBottomSolid',
	CLDW: 'isCollidable',
	INNR: 'inner',
	DSPT: 'displayTexture',
	VSBL: 'isTopBottomVisible',
	OVPH: 'overwritePhysics',
	SLGA: 'slingshotAnimation',
	SVBL: 'isSideVisible',
	REEN: 'isReflectionEnabled',
}
const FLOAT_MAP: Record<string, string> = {
	THRS: 'threshold',
	HTBT: 'heightBottom',
	HTTP: 'heightTop',
	SLGF: 'slingshotForce',
	SLTH: 'slingshotThreshold',
	ELAS: 'elasticity',
	WFCT: 'friction',
	WSCT: 'scatter',
	DILI: 'disableLightingTop',
	DILB: 'disableLightingBelow',
}
const STRING_MAP: Record<string, string> = {
	IMAG: 'szImage',
	SIMG: 'szSideImage',
	MAPH: 'szPhysicsMaterial',
}

/** Surface data.
 * @see https://github.com/vpinball/vpinball/blob/master/surface.cpp */
export class SurfaceData extends ItemData implements IPhysicalData {
	public hitEvent = false
	public isDroppable = false
	public isFlipbook = false
	public isBottomSolid = false
	public isCollidable = true
	public threshold = 2.0
	public szImage?: string
	public szSideImage?: string
	public szSideMaterial?: string
	public szTopMaterial?: string
	public szPhysicsMaterial?: string
	public szSlingShotMaterial?: string
	public heightBottom = 0
	public heightTop = 50
	public inner = true
	public displayTexture = false
	public slingshotForce = 80
	public slingshotThreshold = 0
	public slingshotAnimation = true
	public elasticity!: number
	public friction!: number
	public scatter!: number
	public isTopBottomVisible = true
	public overwritePhysics = true
	public disableLightingTop?: number
	public disableLightingBelow?: number
	public isSideVisible = true
	public isReflectionEnabled = true
	public dragPoints: DragPoint[] = []
	public isDisabled = false

	public static async fromStorage(storage: Storage, itemName: string): Promise<SurfaceData> {
		const d = new SurfaceData(itemName)
		await storage.streamFiltered(itemName, 4, SurfaceData.createStreamHandler(d))
		return d
	}

	private static createStreamHandler(d: SurfaceData) {
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

	private async fromTag(buffer: Uint8Array, tag: string, offset: number, len: number): Promise<number> {
		if (tag in BOOL_MAP) {
			;(this as any)[BOOL_MAP[tag]] = this.getBool(buffer)
			return 0
		}
		if (tag in FLOAT_MAP) {
			;(this as any)[FLOAT_MAP[tag]] = this.getFloat(buffer)
			return 0
		}
		if (tag in STRING_MAP) {
			;(this as any)[STRING_MAP[tag]] = this.getString(buffer, len)
			return 0
		}
		switch (tag) {
			case 'SIMA':
				this.szSideMaterial = this.getString(buffer, len, true)
				break
			case 'TOMA':
				this.szTopMaterial = this.getString(buffer, len, true)
				break
			case 'SLMA':
				this.szSlingShotMaterial = this.getString(buffer, len, true)
				break
			default:
				this.getCommonBlock(buffer, tag, len)
				break
		}
		return 0
	}
}
