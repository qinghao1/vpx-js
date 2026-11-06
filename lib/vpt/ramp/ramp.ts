// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { Vertex2D } from '../../math/vector.js'
import type { Meshes, RenderInfo } from '../../render/irender-api.js'
import { type BiffFieldMap, handleBiffTag } from '../biff-helper.js'
import { type DragPoint, dragPointNestedTag } from '../dragpoint.js'
import { Enums } from '../enums.js'
import { Item } from '../item.js'
import { type IPhysicalData, ItemData } from '../item-data.js'
import { ItemState } from '../item-state.js'
import type { Material } from '../material.js'
import { Mesh } from '../mesh.js'
import type { Table } from '../table/table.js'
import type { Texture } from '../texture.js'
import { isTransparentRampMaterial, RampMeshGenerator, RampUpdater } from './ramp-view.js'

const FLOAT_MAP: BiffFieldMap<RampData> = {
	HTBT: 'heightBottom',
	HTTP: 'heightTop',
	WDBT: 'widthBottom',
	WDTP: 'widthTop',
	WLHL: 'leftWallHeight',
	WLHR: 'rightWallHeight',
	WVHL: 'leftWallHeightVisible',
	WVHR: 'rightWallHeightVisible',
	THRS: 'threshold',
	ELAS: 'elasticity',
	RFCT: 'friction',
	RSCT: 'scatter',
	RADB: 'depthBias',
	RADI: 'wireDiameter',
	RADX: 'wireDistanceX',
	RADY: 'wireDistanceY',
}
const INT_MAP: BiffFieldMap<RampData> = { TYPE: 'rampType', ALGN: 'imageAlignment' }
const BOOL_MAP: BiffFieldMap<RampData> = {
	IMGW: 'imageWalls',
	HTEV: 'hitEvent',
	CLDR: 'isCollidable',
	RVIS: 'isVisible',
	REEN: 'isReflectionEnabled',
	OVPH: 'overwritePhysics',
}
const STRING_MAP: BiffFieldMap<RampData> = { MATR: 'szMaterial', IMAG: 'szImage', MAPH: 'szPhysicsMaterial' }

/** @see https://github.com/vpinball/vpinball/blob/master/ramp.cpp */
export class RampData extends ItemData implements IPhysicalData {
	public depthBias = 0
	public dragPoints: DragPoint[] = []
	public elasticity = 0.3
	public friction = 0.3
	public hitEvent = false
	public heightBottom = 0
	public heightTop = 50
	public imageAlignment = Enums.RampImageAlignment.ImageModeWorld
	public imageWalls = true
	public isCollidable = true
	public isReflectionEnabled = true
	public isVisible = true
	public leftWallHeight = 62
	public leftWallHeightVisible = 30
	public overwritePhysics = true
	public rampType = Enums.RampType.RampTypeFlat
	public rightWallHeight = 62
	public rightWallHeightVisible = 30
	public scatter = 0
	public szImage?: string
	public szMaterial?: string
	public szPhysicsMaterial?: string
	public threshold = 2
	public widthBottom = 75
	public widthTop = 60
	public wireDiameter = 8
	public wireDistanceX = 38
	public wireDistanceY = 88

	public static async fromStorage(storage: Storage, itemName: string): Promise<RampData> {
		const data = new RampData(itemName)
		await storage.streamFiltered(itemName, 4, RampData.createStreamHandler(data))
		return data
	}

	private static createStreamHandler(data: RampData) {
		data.dragPoints = []
		return BiffParser.stream(data.fromTag.bind(data), {
			nestedTags: { DPNT: dragPointNestedTag(data) },
		})
	}

	public constructor(itemName: string) {
		super(itemName)
	}

	private async fromTag(buffer: Uint8Array, tag: string, _offset: number, len: number): Promise<number> {
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

/** @see https://github.com/vpinball/vpinball/blob/master/ramp.cpp */
export class RampState extends ItemState {
	public type?: number

	public heightBottom!: number
	public heightTop!: number
	public widthBottom!: number
	public widthTop!: number
	public leftWallHeight?: number
	public rightWallHeight?: number
	public leftWallHeightVisible!: number
	public rightWallHeightVisible!: number
	public depthBias?: number

	public material?: string
	public texture?: string
	public textureAlignment?: number
	public hasWallImage?: boolean

	public static claim(
		name: string,
		heightBottom: number,
		heightTop: number,
		widthBottom: number,
		widthTop: number,
		leftWallHeight: number | undefined,
		rightWallHeight: number | undefined,
		leftWallHeightVisible: number,
		rightWallHeightVisible: number,
		type: number | undefined,
		material: string | undefined,
		texture: string | undefined,
		textureAlignment: number | undefined,
		hasWallImage: boolean | undefined,
		depthBias: number | undefined,
		isVisible: boolean,
	): RampState {
		const state = new RampState()
		state.name = name
		state.heightBottom = heightBottom
		state.heightTop = heightTop
		state.widthBottom = widthBottom
		state.widthTop = widthTop
		state.leftWallHeight = leftWallHeight
		state.rightWallHeight = rightWallHeight
		state.leftWallHeightVisible = leftWallHeightVisible
		state.rightWallHeightVisible = rightWallHeightVisible
		state.type = type
		state.material = material
		state.texture = texture
		state.textureAlignment = textureAlignment
		state.hasWallImage = hasWallImage
		state.depthBias = depthBias
		state.isVisible = isVisible
		return state
	}
}

/** @see https://github.com/vpinball/vpinball/blob/master/ramp.cpp */
export class Ramp extends Item<RampData> {
	private readonly meshGenerator: RampMeshGenerator

	private readonly state: RampState
	private readonly updater: RampUpdater

	public static async fromStorage(storage: Storage, itemName: string): Promise<Ramp> {
		const data = await RampData.fromStorage(storage, itemName)
		return new Ramp(data)
	}

	public constructor(data: RampData) {
		super(data)
		this.state = RampState.claim(
			data.getName(),
			data.heightBottom,
			data.heightTop,
			data.widthBottom,
			data.widthTop,
			data.leftWallHeight,
			data.rightWallHeight,
			data.leftWallHeightVisible,
			data.rightWallHeightVisible,
			data.rampType,
			data.szMaterial,
			data.szImage,
			data.imageAlignment,
			data.imageWalls,
			data.depthBias,
			// Upstream skips rendering only when both widths are exactly 0 (Render: widthbottom == 0 && widthtop == 0).
			data.isVisible && (data.widthTop !== 0 || data.widthBottom !== 0),
		)
		this.meshGenerator = new RampMeshGenerator(data, this.state)
		this.updater = new RampUpdater(this.state, this.meshGenerator)
	}

	public isCollidable(): boolean {
		return this.data.isCollidable
	}

	public getMeshes<GEOMETRY>(table: Table): Meshes<GEOMETRY> {
		const material = table.getMaterial(this.data.szMaterial)
		return this.meshGenerator.getMeshes(isTransparentRampMaterial(material), table)
	}

	public getState(): RampState {
		return this.state
	}

	public getUpdater(): RampUpdater {
		return this.updater
	}

	public getSurfaceHeight(x: number, y: number, table: Table): number {
		const vVertex = this.meshGenerator.getCentralCurve(table)
		const [vOut, iSeg] = Mesh.closestPointOnPolygon(vVertex, new Vertex2D(x, y), false)
		if (iSeg === -1) return 0
		let totalLength = 0
		let startLength = 0
		const cVertex = vVertex.length
		for (let i2 = 1; i2 < cVertex; i2++) {
			const vDx = vVertex[i2]!.x - vVertex[i2 - 1]!.x
			const vDy = vVertex[i2]!.y - vVertex[i2 - 1]!.y
			const vLen = Math.sqrt(vDx * vDx + vDy * vDy)
			if (i2 <= iSeg) startLength += vLen
			totalLength += vLen
		}
		const dx = vOut.x - vVertex[iSeg]!.x
		const dy = vOut.y - vVertex[iSeg]!.y
		const len = Math.sqrt(dx * dx + dy * dy)
		startLength += len
		const topHeight = this.data.heightTop + table.getTableHeight()
		const bottomHeight = this.data.heightBottom + table.getTableHeight()
		const ratio = totalLength !== 0 ? startLength / totalLength : 0
		return (vVertex[iSeg]?.z ?? 0) + ratio * (topHeight - bottomHeight) + bottomHeight
	}
}
