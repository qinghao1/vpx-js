// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { f4 } from '../../math/float.js'
import { Vertex3D } from '../../math/vertex3d.js'
import { Enums } from '../enums.js'
import { type IPhysicalData, ItemData } from '../item-data.js'
import type { Table } from '../table/table.js'

/** HitTarget data.
 *
 * @see https://github.com/vpinball/vpinball/blob/master/hittarget.cpp */
export class HitTargetData extends ItemData implements IPhysicalData {
	public depthBias?: number
	public disableLightingBelow?: number
	public disableLightingTop?: number
	public dropSpeed: number = 0.5
	public isReflectionEnabled: boolean = true
	public raiseDelay: number = 100
	public elasticity!: number
	public elasticityFalloff!: number
	public friction!: number
	public isCollidable: boolean = true
	public isDropped: boolean = false
	public isVisible: boolean = true
	public legacy: boolean = false
	public overwritePhysics: boolean = false
	public rotZ: number = 0
	public scatter!: number
	public szImage?: string
	public szMaterial?: string
	public szPhysicsMaterial?: string
	public targetType: number = Enums.TargetType.DropTargetSimple
	public threshold: number = 2.0
	public useHitEvent: boolean = true
	public position: Vertex3D = new Vertex3D()
	public vSize: Vertex3D = new Vertex3D(32, 32, 32)

	public static async fromStorage(storage: Storage, itemName: string): Promise<HitTargetData> {
		const hitTargetData = new HitTargetData(itemName)
		await storage.streamFiltered(itemName, 4, BiffParser.stream(hitTargetData.fromTag.bind(hitTargetData), {}))
		return hitTargetData
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

	private async fromTag(buffer: Uint8Array, tag: string, offset: number, len: number): Promise<number> {
		switch (tag) {
			case 'VPOS':
				this.position = Vertex3D.get(buffer)
				break
			case 'VSIZ':
				this.vSize = Vertex3D.get(buffer)
				break
			case 'ROTZ':
				this.rotZ = this.getFloat(buffer)
				break
			case 'IMAG':
				this.szImage = this.getString(buffer, len)
				break
			case 'TRTY':
				this.targetType = this.getInt(buffer)
				break
			case 'MATR':
				this.szMaterial = this.getString(buffer, len)
				break
			case 'TVIS':
				this.isVisible = this.getBool(buffer)
				break
			case 'LEMO':
				this.legacy = this.getBool(buffer)
				break
			case 'ISDR':
				this.isDropped = this.getBool(buffer)
				break
			case 'DRSP':
				this.dropSpeed = this.getFloat(buffer)
				break
			case 'REEN':
				this.isReflectionEnabled = this.getBool(buffer)
				break
			case 'HTEV':
				this.useHitEvent = this.getBool(buffer)
				break
			case 'THRS':
				this.threshold = this.getFloat(buffer)
				break
			case 'ELAS':
				this.elasticity = this.getFloat(buffer)
				break
			case 'ELFO':
				this.elasticityFalloff = this.getFloat(buffer)
				break
			case 'RFCT':
				this.friction = this.getFloat(buffer)
				break
			case 'RSCT':
				this.scatter = this.getFloat(buffer)
				break
			case 'CLDR':
				this.isCollidable = this.getBool(buffer)
				break
			case 'DILI':
				this.disableLightingTop = this.getFloat(buffer)
				break
			case 'DILB':
				this.disableLightingBelow = this.getFloat(buffer)
				break
			case 'PIDB':
				this.depthBias = this.getFloat(buffer)
				break
			case 'RADE':
				this.raiseDelay = this.getInt(buffer)
				break
			case 'MAPH':
				this.szPhysicsMaterial = this.getString(buffer, len)
				break
			case 'OVPH':
				this.overwritePhysics = this.getBool(buffer)
				break
			default:
				this.getCommonBlock(buffer, tag, len)
				break
		}
		return 0
	}

	public getPositionZ(z: number, table: Table) {
		return f4(f4(f4(z * table.getScaleZ()) + this.position.z) + table.getTableHeight())
	}
}
