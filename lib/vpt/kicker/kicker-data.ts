// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { Vertex2D } from '../../util/vector.js'
import { handleBiffTag } from '../biff-helper.js'
import { Enums } from '../enums.js'
import { ItemData } from '../item-data.js'

const FLOAT_MAP: Record<string, string> = {
	RADI: 'radius',
	KSCT: 'scatter',
	KHAC: 'hitAccuracy',
	KHHI: 'hitHeight',
	KORI: 'orientation',
}
const BOOL_MAP: Record<string, string> = { EBLD: 'isEnabled', FATH: 'fallThrough', LEMO: 'legacyMode' }
const STRING_MAP: Record<string, string> = { MATR: 'szMaterial', SURF: 'szSurface' }

/** Kicker data. @see https://github.com/vpinball/vpinball/blob/master/kicker.cpp */
export class KickerData extends ItemData {
	public kickerType: number = Enums.KickerType.KickerHole
	public center!: Vertex2D
	public radius = 25
	public scatter = 0
	public hitAccuracy = 0.5
	public hitHeight = 35
	public orientation = 0
	public szMaterial?: string
	public szSurface?: string
	public fallThrough = false
	public isEnabled = true
	public legacyMode = true

	public static async fromStorage(storage: Storage, itemName: string): Promise<KickerData> {
		const d = new KickerData(itemName)
		await storage.streamFiltered(itemName, 4, BiffParser.stream(d.fromTag.bind(d)))
		return d
	}

	private async fromTag(buffer: Uint8Array, tag: string, _offset: number, len: number): Promise<number> {
		if (tag === 'VCEN') {
			this.center = Vertex2D.get(buffer)
			return 0
		}
		if (tag === 'TYPE') {
			this.kickerType = this.getInt(buffer)
			if (this.kickerType > Enums.KickerType.KickerCup2) this.kickerType = Enums.KickerType.KickerInvisible
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
