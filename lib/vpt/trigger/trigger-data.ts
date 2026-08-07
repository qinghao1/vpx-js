// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { DragPoint } from '../../math/dragpoint.js'
import { Vertex2D } from '../../math/vertex2d.js'
import { Enums } from '../enums.js'
import { ItemData } from '../item-data.js'

const FLOAT_MAP: Record<string, string> = {
	RADI: 'radius',
	ROTA: 'rotation',
	WITI: 'wireThickness',
	SCAX: 'scaleX',
	SCAY: 'scaleY',
	HITH: 'hitHeight',
	ANSP: 'animSpeed',
}
const BOOL_MAP: Record<string, string> = { VSBL: 'isVisible', ENBL: 'isEnabled', REEN: 'isReflectionEnabled' }
const STRING_MAP: Record<string, string> = { MATR: 'szMaterial', SURF: 'szSurface' }

/** Trigger data.
 * @see https://github.com/vpinball/vpinball/blob/master/trigger.cpp */
export class TriggerData extends ItemData {
	public dragPoints: DragPoint[] = []
	public center!: Vertex2D
	public radius = 25
	public rotation = 0
	public scaleX = 1
	public scaleY = 1
	public szMaterial?: string
	public szSurface?: string
	public isVisible = true
	public isEnabled = true
	public hitHeight = 50
	public shape: number = Enums.TriggerShape.TriggerWireA
	public animSpeed = 1
	public wireThickness = 0
	public isReflectionEnabled = true

	public static async fromStorage(storage: Storage, itemName: string): Promise<TriggerData> {
		const d = new TriggerData(itemName)
		await storage.streamFiltered(itemName, 4, TriggerData.createStreamHandler(d))
		return d
	}

	private static createStreamHandler(d: TriggerData) {
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
		if (tag === 'VCEN') {
			this.center = Vertex2D.get(buffer)
			return 0
		}
		if (tag === 'SHAP') {
			this.shape = this.getInt(buffer)
			return 0
		}
		if (tag in FLOAT_MAP) {
			;(this as unknown as Record<string, unknown>)[FLOAT_MAP[tag]] = this.getFloat(buffer)
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
