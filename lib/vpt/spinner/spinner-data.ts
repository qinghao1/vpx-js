// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { Vertex2D } from '../../util/math.js'
import { handleBiffTag } from '../biff-helper.js'
import { ItemData } from '../item-data.js'

const FLOAT_MAP: Record<string, string> = {
	ROTA: 'rotation',
	HIGH: 'height',
	LGTH: 'length',
	AFRC: 'damping',
	SMAX: 'angleMax',
	SMIN: 'angleMin',
	SELA: 'elasticity',
}
const BOOL_MAP: Record<string, string> = { SSUP: 'showBracket', SVIS: 'isVisible' }
const STRING_MAP: Record<string, string> = { MATR: 'szMaterial', IMGF: 'szImage', SURF: 'szSurface' }

/** Spinner data.
 * @see https://github.com/vpinball/vpinball/blob/master/spinner.cpp */
export class SpinnerData extends ItemData {
	public center!: Vertex2D
	public rotation = 0
	public szMaterial?: string
	public showBracket = true
	public height = 60
	public length = 80
	public damping!: number
	public angleMax = 0
	public angleMin = 0
	public elasticity!: number
	public isVisible = true
	public szImage?: string
	public szSurface?: string
	public isReflectionEnabled = true

	public static async fromStorage(storage: Storage, itemName: string): Promise<SpinnerData> {
		const d = new SpinnerData(itemName)
		await storage.streamFiltered(itemName, 4, BiffParser.stream(d.fromTag.bind(d)))
		return d.correctAngles()
	}

	public constructor(itemName: string) {
		super(itemName)
	}

	private correctAngles(): this {
		const lo = Math.min(this.angleMin, this.angleMax)
		const hi = Math.max(this.angleMin, this.angleMax)
		this.angleMin = lo
		this.angleMax = hi
		return this
	}

	private async fromTag(buffer: Uint8Array, tag: string, _offset: number, len: number): Promise<number> {
		if (tag === 'VCEN') {
			this.center = Vertex2D.get(buffer)
			return 0
		}
		if (
			handleBiffTag(this as unknown as Record<string, unknown>, this, tag, buffer, len, {
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
