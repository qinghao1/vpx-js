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
import type { Material } from '../material.js'
import type { Table } from '../table/table.js'
import { SurfaceMeshGenerator, SurfaceUpdater } from './surface-view.js'

const BOOL_MAP: BiffFieldMap<SurfaceData, boolean> = {
	HTEV: 'hitEvent',
	DROP: 'isDroppable',
	FLIP: 'isFlipbook',
	ISBS: 'isBottomSolid',
	CLDW: 'isCollidable',
	DSPT: 'displayTexture',
	VSBL: 'isTopBottomVisible',
	OVPH: 'overwritePhysics',
	SLGA: 'slingshotAnimation',
	SVBL: 'isSideVisible',
	REEN: 'isReflectionEnabled',
}
const FLOAT_MAP: BiffFieldMap<SurfaceData, number> = {
	THRS: 'threshold',
	HTBT: 'heightBottom',
	HTTP: 'heightTop',
	SLGF: 'slingshotForce',
	SLTH: 'slingshotThreshold',
	ELAS: 'elasticity',
	ELFO: 'elasticityFalloff',
	WFCT: 'friction',
	WSCT: 'scatter',
	DILT: 'disableLightingTop',
	DILB: 'disableLightingBelow',
}
const STRING_MAP: BiffFieldMap<SurfaceData, string> = {
	IMAG: 'szImage',
	SIMG: 'szSideImage',
	MAPH: 'szPhysicsMaterial',
	SIMA: 'szSideMaterial',
	TOMA: 'szTopMaterial',
	SLMA: 'szSlingShotMaterial',
}

/** @see https://github.com/vpinball/vpinball/blob/master/src/parts/surface.cpp */
export class SurfaceData extends ItemData {
	public hitEvent = false
	public isDroppable = false
	public isFlipbook = false
	public isBottomSolid = false
	public isCollidable = true
	public threshold = 2.0
	public szImage?: string
	public szSideImage?: string
	public szSideMaterial?: string
	public szTopMaterial?: string
	public szPhysicsMaterial?: string
	public szSlingShotMaterial?: string
	public heightBottom = 0
	public heightTop = 50
	public displayTexture = true
	public slingshotForce = 80
	public slingshotThreshold = 0
	public slingshotAnimation = true
	public elasticity = 0.3
	public elasticityFalloff = 0
	public friction = 0.3
	public scatter = 0
	public isTopBottomVisible = true
	public overwritePhysics = true
	public disableLightingTop = 0
	public disableLightingBelow = 1
	public isSideVisible = true
	public isReflectionEnabled = true
	public dragPoints: DragPoint[] = []
	public isDisabled = false

	public static async fromStorage(storage: Storage, itemName: string): Promise<SurfaceData> {
		const data = new SurfaceData(itemName)
		await storage.streamFiltered(itemName, 4, SurfaceData.createStreamHandler(data))
		return data
	}

	private static createStreamHandler(data: SurfaceData) {
		data.dragPoints = []
		return BiffParser.stream(data.fromTag.bind(data), {
			nestedTags: { DPNT: dragPointNestedTag(data) },
		})
	}

	public constructor(itemName: string) {
		super(itemName)
	}

	private async fromTag(buffer: Uint8Array, tag: string, _offset: number, len: number): Promise<number> {
		if (tag === 'INNR') {
			// Deprecated upstream (surface.cpp:1025-1027): old files still carry it. Upstream
			// arms a one-shot InitPostLoad outline fixup (surface.cpp:1063+) that closes an
			// outer wall over the table border; the port has no equivalent, so consume and ignore.
			return 0
		}
		if (tag === 'DILI') {
			// Pre-10.8 int encoding: 1 means fully on, else an 8-bit dequantized level.
			// Matches upstream dequantizeUnsigned<8>: min(tmp/255, 1) with no lower
			// clamp (surface.cpp:1043, math.h:80-84); negatives stay negative.
			const tmp = this.getInt(buffer)
			this.disableLightingTop = tmp === 1 ? 1 : Math.min(tmp / 255, 1)
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

/** @see https://github.com/vpinball/vpinball/blob/master/src/parts/surface.cpp */
export class SurfaceState extends ItemState {
	public isDropped = false

	public isTopVisible = true
	public topMaterial?: string
	public topTexture?: string

	public isSideVisible = true
	public sideMaterial?: string
	public sideTexture?: string

	// @ts-expect-error
	get isVisible(): boolean {
		return this.isTopVisible || this.isSideVisible
	}
	set isVisible(_v) {
		/* not used in abstract */
	}

	public static claim(
		name: string,
		isDropped: boolean,
		isTopVisible: boolean,
		topMaterial: string | undefined,
		topTexture: string | undefined,
		isSideVisible: boolean,
		sideMaterial: string | undefined,
		sideTexture: string | undefined,
	): SurfaceState {
		const state = new SurfaceState()
		state.name = name
		state.isDropped = isDropped
		state.isTopVisible = isTopVisible
		state.topMaterial = topMaterial
		state.topTexture = topTexture
		state.isSideVisible = isSideVisible
		state.sideMaterial = sideMaterial
		state.sideTexture = sideTexture
		return state
	}
}

/** @see https://github.com/vpinball/vpinball/blob/master/src/parts/surface.cpp */
export class Surface extends Item<SurfaceData> {
	private readonly state: SurfaceState
	private readonly meshGenerator: SurfaceMeshGenerator
	private readonly updater: SurfaceUpdater

	get heightTop() {
		return this.data.heightTop
	}

	public static async fromStorage(storage: Storage, itemName: string): Promise<Surface> {
		const data = await SurfaceData.fromStorage(storage, itemName)
		return new Surface(data)
	}

	public constructor(data: SurfaceData) {
		super(data)
		this.state = SurfaceState.claim(
			data.getName(),
			false,
			data.isTopBottomVisible,
			data.szTopMaterial,
			data.szImage,
			data.isSideVisible,
			data.szSideMaterial,
			data.szSideImage,
		)
		this.meshGenerator = new SurfaceMeshGenerator()
		this.updater = new SurfaceUpdater(this.state, this.data)
	}

	private static isTransparentMat(m?: Material): boolean {
		return !m || (m.isOpacityActive && m.opacity < 0.999)
	}

	public isTransparent(table: Table): boolean {
		if (this.data.isSideVisible && Surface.isTransparentMat(table.getMaterial(this.data.szSideMaterial)))
			return true
		if (this.data.isTopBottomVisible && Surface.isTransparentMat(table.getMaterial(this.data.szTopMaterial)))
			return true
		return false
	}

	public getMeshes<GEOMETRY>(table: Table): Meshes<GEOMETRY> {
		const meshes: Meshes<GEOMETRY> = {}
		const surface = this.meshGenerator.generateMeshes(this.data, table)
		if (surface.top) {
			meshes.top = {
				isVisible: this.data.isTopBottomVisible,
				mesh: surface.top.transform(Matrix3D.RIGHT_HANDED),
				map: table.getTexture(this.data.szImage),
				material: table.getMaterial(this.data.szTopMaterial),
				isTransparent: Surface.isTransparentMat(table.getMaterial(this.data.szTopMaterial)),
				disableLighting: this.data.disableLightingTop,
				disableLightingBelow: this.data.disableLightingBelow,
			}
		}
		if (surface.side) {
			meshes.side = {
				isVisible: this.data.isSideVisible,
				mesh: surface.side.transform(Matrix3D.RIGHT_HANDED),
				map: table.getTexture(this.data.szSideImage),
				material: table.getMaterial(this.data.szSideMaterial),
				isTransparent: Surface.isTransparentMat(table.getMaterial(this.data.szSideMaterial)),
			}
		}
		return meshes
	}

	public getState(): SurfaceState {
		return this.state
	}

	public getUpdater(): SurfaceUpdater {
		return this.updater
	}
}
