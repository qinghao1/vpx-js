// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { Vertex2D } from '../../math/vector.js'
import { handleBiffTag } from '../biff-helper.js'
import { type DragPoint, dragPointNestedTag } from '../dragpoint.js'
import { Enums } from '../enums.js'
import { ItemData } from '../item-data.js'

const FLOAT_MAP: Record<string, string> = {
	RADI: 'radius',
	ROTA: 'rotation',
	WITI: 'wireThickness',
	SCAX: 'scaleX',
	SCAY: 'scaleY',
	THOT: 'hitHeight',
	ANSP: 'animSpeed',
}
const INT_MAP: Record<string, string> = { SHAP: 'shape' }
const BOOL_MAP: Record<string, string> = { VSBL: 'isVisible', EBLD: 'isEnabled', REEN: 'isReflectionEnabled' }
const STRING_MAP: Record<string, string> = { MATR: 'szMaterial', SURF: 'szSurface', LINK: 'stateSrcLink' }

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
	/** Optional controller state link (resuri) set on hit/unhit events. @see TriggerData::m_stateSrcLink in src/parts/trigger.h */
	public stateSrcLink?: string
	public isVisible = true
	public isEnabled = true
	public hitHeight = 50
	public shape: number = Enums.TriggerShape.TriggerWireA
	public animSpeed = 1
	public wireThickness = 0
	public isReflectionEnabled = true

	public static async fromStorage(storage: Storage, itemName: string): Promise<TriggerData> {
		const data = new TriggerData(itemName)
		await storage.streamFiltered(itemName, 4, TriggerData.createStreamHandler(data))
		return data
	}

	private static createStreamHandler(data: TriggerData) {
		data.dragPoints = []
		return BiffParser.stream(data.fromTag.bind(data), {
			nestedTags: { DPNT: dragPointNestedTag(data) },
		})
	}

	private async fromTag(buffer: Uint8Array, tag: string, _offset: number, len: number): Promise<number> {
		if (tag === 'VCEN') {
			this.center = Vertex2D.get(buffer)
			return 0
		}
		if (
			handleBiffTag(this, tag, buffer, len, {
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
}
