// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { Matrix3D } from '../../math/matrix.js'
import type { Meshes } from '../../render/irender-api.js'
import { type BiffFieldMap, handleBiffTag } from '../biff-helper.js'
import { type DragPoint, dragPointNestedTag } from '../dragpoint.js'
import { Item } from '../item.js'
import { ItemData } from '../item-data.js'
import { ItemState } from '../item-state.js'
import type { Table } from '../table/table.js'
import { RubberMeshGenerator, RubberUpdater } from './rubber-view.js'

const FLOAT_MAP: BiffFieldMap<RubberData, number> = {
	HTTP: 'height',
	HTHI: 'hitHeight',
	ELAS: 'elasticity',
	ELFO: 'elasticityFalloff',
	RFCT: 'friction',
	RSCT: 'scatter',
	ROTX: 'rotX',
	ROTY: 'rotY',
	ROTZ: 'rotZ',
}
const INT_MAP: BiffFieldMap<RubberData, number> = { WDTP: 'thickness' }
const BOOL_MAP: BiffFieldMap<RubberData, boolean> = {
	HTEV: 'hitEvent',
	CLDR: 'isCollidable',
	RVIS: 'isVisible',
	REEN: 'isReflectionEnabled',
	ESTR: 'staticRendering',
	ESIE: 'showInEditor',
	OVPH: 'overwritePhysics',
}
const STRING_MAP: BiffFieldMap<RubberData, string> = { MATR: 'szMaterial', IMAG: 'szImage', MAPH: 'szPhysicsMaterial' }

/** @see https://github.com/vpinball/vpinball/blob/master/rubber.cpp */
export class RubberData extends ItemData {
	public height = 25
	public hitHeight = 25
	public thickness = 8
	public hitEvent = false
	public szMaterial?: string
	public szImage?: string
	public elasticity = 0.8
	public elasticityFalloff = 0.3
	public friction = 0.6
	public scatter = 5
	public isCollidable = true
	public isVisible = true
	public isReflectionEnabled = true
	public staticRendering = true
	public showInEditor = false
	public rotX = 0
	public rotY = 0
	public rotZ = 0
	public szPhysicsMaterial?: string
	public overwritePhysics = false
	public dragPoints: DragPoint[] = []

	public static async fromStorage(storage: Storage, itemName: string): Promise<RubberData> {
		const data = new RubberData(itemName)
		// Upstream presets m_hitHeight = -1 and folds it to m_height after
		// tag parsing (rubber.cpp Load); a missing tag must not keep 25.
		data.hitHeight = -1
		await storage.streamFiltered(itemName, 4, RubberData.createStreamHandler(data))
		if (data.hitHeight === -1) data.hitHeight = data.height
		return data
	}

	private static createStreamHandler(data: RubberData) {
		data.dragPoints = []
		return BiffParser.stream(data.fromTag.bind(data), {
			nestedTags: { DPNT: dragPointNestedTag(data) },
		})
	}

	public constructor(itemName: string) {
		super(itemName)
	}

	private async fromTag(buffer: Uint8Array, tag: string, _offset: number, len: number): Promise<number> {
		if (tag === 'PNTS') return 0
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

/** @see https://github.com/vpinball/vpinball/blob/master/rubber.cpp */
export class RubberState extends ItemState {
	public height!: number
	public rotX!: number
	public rotY!: number
	public rotZ!: number
	public material?: string
	public texture?: string

	public static claim(
		name: string,
		height: number,
		rotX: number,
		rotY: number,
		rotZ: number,
		material: string | undefined,
		texture: string | undefined,
		isVisible: boolean,
	): RubberState {
		const state = new RubberState()
		state.name = name
		state.height = height
		state.rotX = rotX
		state.rotY = rotY
		state.rotZ = rotZ
		state.material = material
		state.texture = texture
		state.isVisible = isVisible
		return state
	}
}

/** @see https://github.com/vpinball/vpinball/blob/master/rubber.cpp */
export class Rubber extends Item<RubberData> {
	private readonly state: RubberState
	private readonly meshGenerator: RubberMeshGenerator
	private readonly updater: RubberUpdater

	public static async fromStorage(storage: Storage, itemName: string): Promise<Rubber> {
		const data = await RubberData.fromStorage(storage, itemName)
		return new Rubber(data)
	}

	public constructor(data: RubberData) {
		super(data)
		this.state = RubberState.claim(
			data.getName(),
			data.height,
			data.rotX,
			data.rotY,
			data.rotZ,
			data.szMaterial,
			data.szImage,
			data.isVisible,
		)
		this.meshGenerator = new RubberMeshGenerator(data)
		this.updater = new RubberUpdater(this.data, this.state, this.meshGenerator.middlePoint)
	}

	public getMeshes<GEOMETRY>(table: Table): Meshes<GEOMETRY> {
		const mesh = this.meshGenerator.getMeshes(table)
		return {
			rubber: {
				isVisible: this.data.isVisible,
				mesh: mesh.transform(Matrix3D.RIGHT_HANDED),
				map: table.getTexture(this.data.szImage),
				material: table.getMaterial(this.data.szMaterial),
			},
		}
	}

	public getState(): RubberState {
		return this.state
	}

	public getUpdater(): RubberUpdater {
		return this.updater
	}
}
