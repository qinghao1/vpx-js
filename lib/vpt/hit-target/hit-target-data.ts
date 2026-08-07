// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { f4 } from '../../util/float.js'
import { Vertex3D } from '../../util/math.js'
import { handleBiffTag } from '../biff-helper.js'
import { Enums } from '../enums.js'
import { type IPhysicalData, ItemData } from '../item-data.js'
import type { Table } from '../table/table.js'

const FLOAT_MAP: Record<string, string> = {
	ROTZ: 'rotZ',
	DRSP: 'dropSpeed',
	THRS: 'threshold',
	ELAS: 'elasticity',
	ELFO: 'elasticityFalloff',
	RFCT: 'friction',
	RSCT: 'scatter',
	DILI: 'disableLightingTop',
	DILB: 'disableLightingBelow',
	PIDB: 'depthBias',
}
const INT_MAP: Record<string, string> = { TRTY: 'targetType', RADE: 'raiseDelay' }
const BOOL_MAP: Record<string, string> = {
	TVIS: 'isVisible',
	LEMO: 'legacy',
	ISDR: 'isDropped',
	REEN: 'isReflectionEnabled',
	HTEV: 'useHitEvent',
	CLDR: 'isCollidable',
	OVPH: 'overwritePhysics',
}
const STRING_MAP: Record<string, string> = { IMAG: 'szImage', MATR: 'szMaterial', MAPH: 'szPhysicsMaterial' }

/** HitTarget data.
 * @see https://github.com/vpinball/vpinball/blob/master/hittarget.cpp */
export class HitTargetData extends ItemData implements IPhysicalData {
	public depthBias?: number
	public disableLightingBelow?: number
	public disableLightingTop?: number
	public dropSpeed = 0.5
	public isReflectionEnabled = true
	public raiseDelay = 100
	public elasticity!: number
	public elasticityFalloff!: number
	public friction!: number
	public isCollidable = true
	public isDropped = false
	public isVisible = true
	public legacy = false
	public overwritePhysics = false
	public rotZ = 0
	public scatter!: number
	public szImage?: string
	public szMaterial?: string
	public szPhysicsMaterial?: string
	public targetType: number = Enums.TargetType.DropTargetSimple
	public threshold = 2.0
	public useHitEvent = true
	public position: Vertex3D = new Vertex3D()
	public vSize: Vertex3D = new Vertex3D(32, 32, 32)

	public static async fromStorage(storage: Storage, itemName: string): Promise<HitTargetData> {
		const d = new HitTargetData(itemName)
		await storage.streamFiltered(itemName, 4, BiffParser.stream(d.fromTag.bind(d)))
		return d
	}

	public constructor(itemName: string) {
		super(itemName)
	}

	public isDropTarget(): boolean {
		return (
			this.targetType === Enums.TargetType.DropTargetBeveled ||
			this.targetType === Enums.TargetType.DropTargetFlatSimple ||
			this.targetType === Enums.TargetType.DropTargetSimple
		)
	}

	private async fromTag(buffer: Uint8Array, tag: string, _offset: number, len: number): Promise<number> {
		if (tag === 'VPOS') {
			this.position = Vertex3D.get(buffer)
			return 0
		}
		if (tag === 'VSIZ') {
			this.vSize = Vertex3D.get(buffer)
			return 0
		}
		if (
			handleBiffTag(this as unknown as Record<string, unknown>, this, tag, buffer, len, {
				float: FLOAT_MAP,
				int: INT_MAP,
				bool: BOOL_MAP,
				string: STRING_MAP,
			})
		)
			return 0
		this.getCommonBlock(buffer, tag, len)
		return 0
	}

	public getPositionZ(z: number, table: Table): number {
		return f4(f4(f4(z * table.getScaleZ()) + this.position.z) + table.getTableHeight())
	}
}
