// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { DragPoint } from '../../math/dragpoint.js'
import { f4 } from '../../math/float.js'
import { type IPhysicalData, ItemData } from '../item-data.js'

const FLOAT_MAP: Record<string, string> = {
	HTTP: 'height',
	HTHI: 'hitHeight',
	ELAS: 'elasticity',
	ELFO: 'elasticityFalloff',
	RFCT: 'friction',
	RSCT: 'scatter',
	ROTX: 'rotX',
	ROTY: 'rotY',
	ROTZ: 'rotZ',
}
const INT_MAP: Record<string, string> = { WDTP: 'thickness' }
const BOOL_MAP: Record<string, string> = {
	HTEV: 'hitEvent',
	CLDR: 'isCollidable',
	RVIS: 'isVisible',
	REEN: 'isReflectionEnabled',
	ESTR: 'staticRendering',
	ESIE: 'showInEditor',
	OVPH: 'overwritePhysics',
}
const STRING_MAP: Record<string, string> = { MATR: 'szMaterial', IMAG: 'szImage', MAPH: 'szPhysicsMaterial' }

/** Rubber data.
 * @see https://github.com/vpinball/vpinball/blob/master/rubber.cpp */
export class RubberData extends ItemData implements IPhysicalData {
	public height: number = f4(25)
	public hitHeight: number = f4(-1.0)
	public thickness: number = f4(8)
	public hitEvent = false
	public szMaterial?: string
	public szImage?: string
	public elasticity!: number
	public elasticityFalloff!: number
	public friction!: number
	public scatter!: number
	public isCollidable = true
	public isVisible = true
	public isReflectionEnabled = true
	public staticRendering = true
	public showInEditor = true
	public rotX = 0
	public rotY = 0
	public rotZ = 0
	public szPhysicsMaterial?: string
	public overwritePhysics = false
	public dragPoints: DragPoint[] = []

	public static async fromStorage(storage: Storage, itemName: string): Promise<RubberData> {
		const d = new RubberData(itemName)
		await storage.streamFiltered(itemName, 4, RubberData.createStreamHandler(d))
		return d
	}

	private static createStreamHandler(d: RubberData) {
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

	private async fromTag(buffer: Uint8Array, tag: string, offset: number, len: number): Promise<number> {
		if (tag === 'PNTS') return 0
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
}
