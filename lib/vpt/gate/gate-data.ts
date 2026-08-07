// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { Vertex2D } from '../../util/math.js'
import { handleBiffTag } from '../biff-helper.js'
import { Enums } from '../enums.js'
import { ItemData } from '../item-data.js'

const FLOAT_MAP: Record<string, string> = {
	LGTH: 'length',
	HGTH: 'height',
	ROTA: 'rotation',
	ELAS: 'elasticity',
	GAMA: 'angleMax',
	GAMI: 'angleMin',
	GFRC: 'friction',
	AFRC: 'damping',
	GGFC: 'gravityFactor',
}
const BOOL_MAP: Record<string, string> = {
	GSUP: 'showBracket',
	GCOL: 'isCollidable',
	TWWA: 'twoWay',
	GVSB: 'isVisible',
	REEN: 'isReflectionEnabled',
}
const STRING_MAP: Record<string, string> = { MATR: 'szMaterial', SURF: 'szSurface' }

/** Gate data.
 * @see https://github.com/vpinball/vpinball/blob/master/gate.cpp */
export class GateData extends ItemData {
	public angleMax = Math.PI / 2
	public angleMin = 0
	public damping = 0.985
	public elasticity = 0.3
	public friction = 0.02
	public gateType: number = Enums.GateType.GateWireW
	public gravityFactor = 0.25
	public height = 50
	public isCollidable = true
	public isReflectionEnabled = true
	public isVisible = true
	public length = 100
	public rotation = -90
	public showBracket = true
	public szMaterial?: string
	public szSurface?: string
	public twoWay = true
	public center!: Vertex2D

	public static async fromStorage(storage: Storage, itemName: string): Promise<GateData> {
		const d = new GateData(itemName)
		await storage.streamFiltered(itemName, 4, BiffParser.stream(d.fromTag.bind(d)))
		return d
	}

	public constructor(itemName: string) {
		super(itemName)
	}

	private async fromTag(buffer: Uint8Array, tag: string, _offset: number, len: number): Promise<number> {
		if (tag === 'GATY') {
			this.gateType = this.getInt(buffer)
			if (this.gateType < Enums.GateType.GateWireW || this.gateType > Enums.GateType.GateLongPlate)
				this.gateType = Enums.GateType.GateWireW
			return 0
		}
		if (tag === 'VCEN') {
			this.center = Vertex2D.get(buffer)
			return 0
		}
		if (
			handleBiffTag(this, tag, buffer, len, {
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
