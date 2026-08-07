// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { Vertex2D } from '../../util/math.js'
import { ItemData } from '../item-data.js'

const FLOAT_TAGS: Record<string, string> = {
	RADI: 'radius',
	THRS: 'threshold',
	FORC: 'force',
	BSCT: 'scatter',
	HISC: 'heightScale',
	RISP: 'ringSpeed',
	ORIN: 'orientation',
	RDLI: 'ringDropOffset',
}
const STRING_TAGS: Record<string, string> = {
	MATR: 'szCapMaterial',
	RIMA: 'szRingMaterial',
	BAMA: 'szBaseMaterial',
	SKMA: 'szSkirtMaterial',
	SURF: 'szSurface',
}
const BOOL_TAGS: Record<string, string> = {
	CAVI: 'isCapVisible',
	HAHE: 'hitEvent',
	COLI: 'isCollidable',
	RIVS: 'isRingVisible',
	SKVS: 'isSkirtVisible',
	REEN: 'isReflectionEnabled',
}

/** Bumper data.
 * @see https://github.com/vpinball/vpinball/blob/master/bumper.cpp */
export class BumperData extends ItemData {
	public center!: Vertex2D
	public radius = 45
	public szCapMaterial?: string
	public szRingMaterial?: string
	public szBaseMaterial?: string
	public szSkirtMaterial?: string
	public threshold = 1.0
	public force!: number
	public scatter?: number
	public heightScale = 90.0
	public ringSpeed = 0.5
	public orientation = 0.0
	public ringDropOffset = 0.0
	public szSurface?: string
	public isCapVisible = true
	public isBaseVisible = true
	public isRingVisible = true
	public isSkirtVisible = true
	public hitEvent = true
	public isCollidable = true
	public isReflectionEnabled = true

	public static async fromStorage(storage: Storage, itemName: string): Promise<BumperData> {
		const d = new BumperData(itemName)
		await storage.streamFiltered(itemName, 4, BiffParser.stream(d.fromTag.bind(d)))
		return d
	}

	public constructor(itemName: string) {
		super(itemName)
	}

	private async fromTag(buffer: Uint8Array, tag: string, offset: number, len: number): Promise<number> {
		if (tag === 'VCEN') {
			this.center = Vertex2D.get(buffer)
			return 0
		}
		if (tag in FLOAT_TAGS) {
			;(this as unknown as Record<string, unknown>)[FLOAT_TAGS[tag]] = this.getFloat(buffer)
			return 0
		}
		if (tag in STRING_TAGS) {
			;(this as unknown as Record<string, unknown>)[STRING_TAGS[tag]] = this.getString(buffer, len)
			return 0
		}
		if (tag in BOOL_TAGS) {
			;(this as unknown as Record<string, unknown>)[BOOL_TAGS[tag]] = this.getBool(buffer)
			return 0
		}
		switch (tag) {
			case 'BVIS': {
				const v = this.getBool(buffer)
				this.isCapVisible = this.isBaseVisible = this.isRingVisible = this.isSkirtVisible = v
				break
			}
			case 'BSVS': {
				const v = this.getBool(buffer)
				this.isBaseVisible = this.isRingVisible = this.isSkirtVisible = v
				break
			}
			default:
				this.getCommonBlock(buffer, tag, len)
				break
		}
		return 0
	}
}
