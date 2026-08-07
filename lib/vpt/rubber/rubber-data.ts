// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { DragPoint } from '../../math/dragpoint.js'
import { f4 } from '../../math/float.js'
import { type IPhysicalData, ItemData } from '../item-data.js'

/** Rubber data.
 *
 * @see https://github.com/vpinball/vpinball/blob/master/rubber.cpp */
export class RubberData extends ItemData implements IPhysicalData {
	public height: number = f4(25)
	public hitHeight: number = f4(-1.0)
	public thickness: number = f4(8)
	public hitEvent: boolean = false
	public szMaterial?: string
	public szImage?: string
	public elasticity!: number
	public elasticityFalloff!: number
	public friction!: number
	public scatter!: number
	public isCollidable: boolean = true
	public isVisible: boolean = true
	public isReflectionEnabled: boolean = true
	public staticRendering: boolean = true
	public showInEditor: boolean = true
	public rotX: number = 0
	public rotY: number = 0
	public rotZ: number = 0
	public szPhysicsMaterial?: string
	public overwritePhysics: boolean = false
	public dragPoints: DragPoint[] = []

	public static async fromStorage(storage: Storage, itemName: string): Promise<RubberData> {
		const rubberItem = new RubberData(itemName)
		await storage.streamFiltered(itemName, 4, RubberData.createStreamHandler(rubberItem))
		return rubberItem
	}

	private static createStreamHandler(rubberItem: RubberData) {
		rubberItem.dragPoints = []
		return BiffParser.stream(rubberItem.fromTag.bind(rubberItem), {
			nestedTags: {
				DPNT: {
					onStart: () => new DragPoint(),
					onTag: (dragPoint) => dragPoint.fromTag.bind(dragPoint),
					onEnd: (dragPoint) => rubberItem.dragPoints.push(dragPoint),
				},
			},
		})
	}

	private async fromTag(buffer: Uint8Array, tag: string, offset: number, len: number): Promise<number> {
		switch (tag) {
			case 'HTTP':
				this.height = this.getFloat(buffer)
				break
			case 'HTHI':
				this.hitHeight = this.getFloat(buffer)
				break
			case 'WDTP':
				this.thickness = this.getInt(buffer)
				break
			case 'HTEV':
				this.hitEvent = this.getBool(buffer)
				break
			case 'MATR':
				this.szMaterial = this.getString(buffer, len)
				break
			case 'IMAG':
				this.szImage = this.getString(buffer, len)
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
			case 'RVIS':
				this.isVisible = this.getBool(buffer)
				break
			case 'REEN':
				this.isReflectionEnabled = this.getBool(buffer)
				break
			case 'ESTR':
				this.staticRendering = this.getBool(buffer)
				break
			case 'ESIE':
				this.showInEditor = this.getBool(buffer)
				break
			case 'ROTX':
				this.rotX = this.getFloat(buffer)
				break
			case 'ROTY':
				this.rotY = this.getFloat(buffer)
				break
			case 'ROTZ':
				this.rotZ = this.getFloat(buffer)
				break
			case 'MAPH':
				this.szPhysicsMaterial = this.getString(buffer, len)
				break
			case 'OVPH':
				this.overwritePhysics = this.getBool(buffer)
				break
			case 'PNTS':
				break // never read in vpinball
			default:
				this.getCommonBlock(buffer, tag, len)
				break
		}
		return 0
	}
}
