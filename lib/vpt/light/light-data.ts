// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { DragPoint } from '../../util/dragpoint.js'
import { Vertex2D } from '../../util/math.js'
import { handleBiffTag } from '../biff-helper.js'
import { Enums } from '../enums.js'
import { ItemData } from '../item-data.js'
import type { Table } from '../table/table.js'

const FLOAT_MAP: Record<string, string> = {
	HGHT: 'height',
	RADI: 'falloff',
	FAPO: 'falloffPower',
	BWTH: 'intensity',
	TRMS: 'transmissionScale',
	LIDB: 'depthBias',
	FASP: 'fadeSpeedUp',
	FASD: 'fadeSpeedDown',
	BMSC: 'meshRadius',
	BMVA: 'bulbModulateVsAdd',
	BHHI: 'bulbHaloHeight',
	STTF: 'state',
}
const INT_MAP: Record<string, string> = { STAT: 'state', BINT: 'blinkInterval', SHDW: 'shadows', FADE: 'fader' }
const BOOL_MAP: Record<string, string> = {
	SHAP: 'roundLight',
	BGLS: 'isBackglass',
	BULT: 'bulbLight',
	IMMO: 'imageMode',
	SHBM: 'showBulbMesh',
	STBM: 'staticBulbMesh',
	SHRB: 'showReflectionOnBall',
	VSBL: 'isVisible',
}
const STRING_MAP: Record<string, string> = { IMG1: 'szOffImage', BPAT: 'rgBlinkPattern', SURF: 'szSurface' }

/** Light data.
 * @see https://github.com/vpinball/vpinball/blob/master/light.cpp */
export class LightData extends ItemData {
	public center!: Vertex2D
	public falloff = 50
	public falloffPower = 2
	public state: number = Enums.LightStatus.LightStateOff
	public color = 0x57a9ff // RGB(255,169,87) 2700K
	public color2 = 0x57a9ff
	public szOffImage?: string
	public roundLight = false
	public rgBlinkPattern = '10'
	public blinkInterval = 125
	public intensity = 10
	public transmissionScale = 0
	public szSurface?: string
	public isBackglass = false
	public depthBias?: number
	public fadeSpeedUp = 0.05 // 200ms
	public fadeSpeedDown = 0.02 // 500ms
	public bulbLight = false
	public imageMode = false
	public showBulbMesh = false
	public staticBulbMesh = true
	public showReflectionOnBall = true
	public meshRadius = 20
	public bulbModulateVsAdd = 0.9
	public bulbHaloHeight = 28
	public height = 0
	public shadows = 0 // ShadowMode::NONE
	public fader = 0 // Fader::LINEAR
	public dragPoints: DragPoint[] = []
	public isVisible = true

	public static async fromStorage(storage: Storage, itemName: string): Promise<LightData> {
		const d = new LightData(itemName)
		await storage.streamFiltered(itemName, 4, LightData.createStreamHandler(d))
		return d
	}

	private static createStreamHandler(d: LightData) {
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

	private constructor(itemName: string) {
		super(itemName)
	}

	public isOn(): boolean {
		if (this.state === Enums.LightStatus.LightStateOff) return false
		if (this.state === Enums.LightStatus.LightStateBlinking) return this.rgBlinkPattern?.[0] === '1'
		return this.state === Enums.LightStatus.LightStateOn
	}

	public isBulbLight(): boolean {
		return this.showBulbMesh && this.meshRadius > 0
	}

	public isPlayfieldLight(table: Table): boolean {
		return this.isSurfaceLight(table) && !this.isOnSurface(table)
	}

	private isOnSurface(table: Table): boolean {
		return !!this.szSurface && !!table.surfaces[this.szSurface]
	}

	public isSurfaceLight(table: Table): boolean {
		if (!this.szOffImage || this.bulbLight) return false
		if (table.getPlayfieldMap()?.toLowerCase() === this.szOffImage.toLowerCase() && this.dragPoints.length > 2)
			return true
		if (Object.values(table.surfaces).some((s) => s.image === this.szOffImage)) return true
		return Object.values(table.lights).filter((l) => l.offImage === this.szOffImage).length > 3
	}

	private async fromTag(buffer: Uint8Array, tag: string, _offset: number, len: number): Promise<number> {
		if (tag === 'VCEN') {
			this.center = Vertex2D.get(buffer)
			return 0
		}
		if (tag === 'COLR') {
			this.color = BiffParser.bgrToRgb(this.getInt(buffer))
			return 0
		}
		if (tag === 'COL2') {
			this.color2 = BiffParser.bgrToRgb(this.getInt(buffer))
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
