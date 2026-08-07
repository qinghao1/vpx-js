// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { DragPoint } from '../../util/dragpoint.js'
import { Vertex2D } from '../../util/math.js'
import { handleBiffTag } from '../biff-helper.js'
import { Enums } from '../enums.js'
import { ItemData } from '../item-data.js'

const FLOAT_MAP: Record<string, string> = {
	FHEI: 'height',
	FROX: 'rotX',
	FROY: 'rotY',
	FROZ: 'rotZ',
	MOVA: 'modulateVsAdd',
	FLDB: 'depthBias',
}
const INT_MAP: Record<string, string> = {
	ALGN: 'imageAlignment',
	FILT: 'filter',
	FIAM: 'filterAmount',
	COLR: 'color',
	FALP: 'alpha',
}
const BOOL_MAP: Record<string, string> = { FVIS: 'isVisible', ADDB: 'addBlend', IDMD: 'isDMD', DSPT: 'displayTexture' }
const STRING_MAP: Record<string, string> = { IMAG: 'szImageA', IMAB: 'szImageB' }

/** Flasher data.
 * @see https://github.com/vpinball/vpinball/blob/master/flasher.cpp */
export class FlasherData extends ItemData {
	public height = 50
	public center: Vertex2D = new Vertex2D()
	public rotX = 0
	public rotY = 0
	public rotZ = 0
	public color = 0x32c832
	public szImageA?: string
	public szImageB?: string
	public alpha = 100
	public modulateVsAdd = 0.9
	public isVisible = true
	public addBlend = false
	public isDMD = false
	public displayTexture = false
	public depthBias = 0
	public imageAlignment: number = Enums.ImageAlignment.ImageAlignTopLeft
	public filter: number = Enums.Filters.Filter_Overlay
	public filterAmount = 100
	private dragPoints: DragPoint[] = []
	public intensityScale = 1

	public static async fromStorage(storage: Storage, itemName: string): Promise<FlasherData> {
		const d = new FlasherData(itemName)
		await storage.streamFiltered(itemName, 4, FlasherData.createStreamHandler(d))
		return d
	}

	private static createStreamHandler(d: FlasherData) {
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

	private constructor(itemName: string) {
		super(itemName)
	}

	private async fromTag(buffer: Uint8Array, tag: string, _offset: number, len: number): Promise<number> {
		if (tag === 'FLAX') {
			this.center.x = this.getFloat(buffer)
			return 0
		}
		if (tag === 'FLAY') {
			this.center.y = this.getFloat(buffer)
			return 0
		}
		if (tag === 'FALP') {
			this.alpha = Math.max(0, this.getInt(buffer))
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
