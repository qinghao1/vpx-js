// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { Vertex2D } from '../../math/vector.js'
import { CatmullCurve2D } from '../../util/catmull-curve.js'
import { RenderVertex } from '../../util/vertex.js'
import { handleBiffTag } from '../biff-helper.js'
import { DragPoint, dragPointNestedTag } from '../dragpoint.js'
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
}
const BOOL_MAP: Record<string, string> = { FVIS: 'isVisible', IDMD: 'isDMD', DSPT: 'displayTexture' }
const STRING_MAP: Record<string, string> = {
	IMAG: 'szImageA',
	IMAB: 'szImageB',
	LMAP: 'szLightmap',
	SLNK: 'stateSrcLink',
	LINK: 'imageSrcLink',
}

/** How the flasher blends over the scene. @see FlasherData::AddBlendMode in src/parts/flasher.h */
export enum FlasherAddBlend {
	None = 0,
	Add = 1,
	Absorb = 2,
}

export function clampAddBlend(value: number): FlasherAddBlend {
	return Math.max(FlasherAddBlend.None, Math.min(FlasherAddBlend.Absorb, value)) as FlasherAddBlend
}

/** Flasher data.
 * @see https://github.com/vpinball/vpinball/blob/master/flasher.cpp */
export class FlasherData extends ItemData {
	public height = 50
	public rotX = 0
	public rotY = 0
	public rotZ = 0
	public color = 0x32c832
	public szImageA?: string
	/** Second flasher image. Parsed and scriptable, but not honored by the renderer yet (only ImageA is drawn). */
	public szImageB?: string
	/** Linked light modulating opacity. @see FlasherData::m_szLightmap in src/parts/flasher.h */
	public szLightmap?: string
	/** Optional controller state source (resuri) modulating opacity, overriding the lightmap. @see FlasherData::m_stateSrcLink in src/parts/flasher.h */
	public stateSrcLink?: string
	/** Optional display-source link (resuri) selecting the flasher image. Parsed and stored; renderer support is separate work. @see FlasherData::m_imageSrcLink in src/parts/flasher.h */
	public imageSrcLink?: string
	public alpha = 100
	public modulateVsAdd = 0.9
	public isVisible = true
	public addBlendMode: FlasherAddBlend = FlasherAddBlend.None
	public isDMD = false
	public displayTexture = false
	public depthBias = 0
	public imageAlignment: number = Enums.RampImageAlignment.ImageModeWrap
	/** Blend filter. Parsed and scriptable, but not honored by the renderer yet (no custom flasher shader). */
	public filter: number = Enums.Filters.Filter_Overlay
	/** Blend filter strength. Parsed and scriptable, but not honored by the renderer yet (no custom flasher shader). */
	public filterAmount = 100
	public dragPoints: DragPoint[] = []
	public intensityScale = 1

	/** Legacy boolean view of {@link addBlendMode}: absorb reads as additive and writes clamp to add/none like upstream. */
	public get addBlend(): boolean {
		return this.addBlendMode !== FlasherAddBlend.None
	}
	public set addBlend(value: boolean) {
		this.addBlendMode = value ? FlasherAddBlend.Add : FlasherAddBlend.None
	}

	public static async fromStorage(storage: Storage, itemName: string): Promise<FlasherData> {
		const flasherData = new FlasherData(itemName)
		await storage.streamFiltered(itemName, 4, FlasherData.createStreamHandler(flasherData))
		return flasherData
	}

	private static createStreamHandler(flasherData: FlasherData) {
		return BiffParser.stream(flasherData.fromTag.bind(flasherData), {
			nestedTags: { DPNT: dragPointNestedTag(flasherData) },
		})
	}

	private constructor(itemName: string) {
		super(itemName)
	}

	public getCenter(): Vertex2D {
		const outline = DragPoint.getRgVertex(this.dragPoints, () => new RenderVertex(), CatmullCurve2D.fromVertex2D)
		const points: Array<{ x: number; y: number }> =
			outline.length > 0 ? outline : this.dragPoints.map(dragPoint => dragPoint.vertex)
		let minX = Infinity
		let minY = Infinity
		let maxX = -Infinity
		let maxY = -Infinity
		for (const point of points) {
			if (point.x < minX) minX = point.x
			if (point.x > maxX) maxX = point.x
			if (point.y < minY) minY = point.y
			if (point.y > maxY) maxY = point.y
		}
		if (!Number.isFinite(minX)) return new Vertex2D()
		return new Vertex2D((minX + maxX) * 0.5, (minY + maxY) * 0.5)
	}

	private async fromTag(buffer: Uint8Array, tag: string, _offset: number, len: number): Promise<number> {
		if (tag === 'FLAX' || tag === 'FLAY') {
			// Center is derived from drag points; upstream ignores these on load.
			return 0
		}
		if (tag === 'FALP') {
			this.alpha = Math.max(0, this.getInt(buffer))
			return 0
		}
		if (tag === 'RDMD') {
			this.isDMD = this.getInt(buffer) === 1
			return 0
		}
		if (tag === 'ADDB') {
			this.addBlendMode = clampAddBlend(this.getInt(buffer))
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
