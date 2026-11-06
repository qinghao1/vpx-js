// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { Matrix3D } from '../../math/matrix.js'
import { Vertex3D } from '../../math/vector.js'
import { type BiffFieldMap, handleBiffTag } from '../biff-helper.js'
import { Enums } from '../enums.js'
import { Item } from '../item.js'
import { ItemData } from '../item-data.js'
import { ItemState } from '../item-state.js'
import type { Material } from '../material.js'
import type { Mesh } from '../mesh.js'
import type { Table } from '../table/table.js'
import type { Texture } from '../texture.js'
import { HitTargetMeshGenerator, HitTargetUpdater } from './hit-target-view.js'

const FLOAT_MAP: BiffFieldMap<HitTargetData, number> = {
	ROTZ: 'rotZ',
	DRSP: 'dropSpeed',
	THRS: 'threshold',
	ELAS: 'elasticity',
	ELFO: 'elasticityFalloff',
	RFCT: 'friction',
	RSCT: 'scatter',
	DILT: 'disableLightingTop',
	DILB: 'disableLightingBelow',
	PIDB: 'depthBias',
}
const INT_MAP: BiffFieldMap<HitTargetData, number> = { TRTY: 'targetType', RADE: 'raiseDelay' }
const BOOL_MAP: BiffFieldMap<HitTargetData, boolean> = {
	TVIS: 'isVisible',
	LEMO: 'legacy',
	ISDR: 'isDropped',
	REEN: 'isReflectionEnabled',
	HTEV: 'useHitEvent',
	CLDR: 'isCollidable',
	OVPH: 'overwritePhysics',
}
const STRING_MAP: BiffFieldMap<HitTargetData, string> = {
	IMAG: 'szImage',
	MATR: 'szMaterial',
	MAPH: 'szPhysicsMaterial',
}

/** @see https://github.com/vpinball/vpinball/blob/master/hittarget.cpp */
export class HitTargetData extends ItemData {
	public depthBias?: number
	public disableLightingBelow?: number
	public disableLightingTop?: number
	public dropSpeed = 0.2
	public isReflectionEnabled = true
	public raiseDelay = 100
	public elasticity = 0.35
	public elasticityFalloff = 0.5
	public friction = 0.2
	public isCollidable = true
	public isDropped = false
	public isVisible = true
	public legacy = false
	public overwritePhysics = false
	public rotZ = 0
	public scatter = 5
	public szImage?: string
	public szMaterial?: string
	public szPhysicsMaterial?: string
	public targetType: number = Enums.TargetType.DropTargetSimple
	public threshold = 2.0
	public useHitEvent = true
	public position: Vertex3D = new Vertex3D()
	public vSize: Vertex3D = new Vertex3D(32, 32, 32)

	public static async fromStorage(storage: Storage, itemName: string): Promise<HitTargetData> {
		const d = new HitTargetData(itemName)
		await storage.streamFiltered(itemName, 4, BiffParser.stream(d.fromTag.bind(d)))
		return d
	}

	public constructor(itemName: string) {
		super(itemName)
	}

	public isDropTarget(): boolean {
		return (
			this.targetType === Enums.TargetType.DropTargetBeveled ||
			this.targetType === Enums.TargetType.DropTargetFlatSimple ||
			this.targetType === Enums.TargetType.DropTargetSimple
		)
	}

	private async fromTag(buffer: Uint8Array, tag: string, _offset: number, len: number): Promise<number> {
		if (tag === 'VPOS') {
			this.position = Vertex3D.get(buffer)
			return 0
		}
		if (tag === 'VSIZ') {
			this.vSize = Vertex3D.get(buffer)
			return 0
		}
		if (tag === 'DILI') {
			// Pre-10.8 files store this as a quantized int, with 1 meaning fully on.
			const legacy = this.getInt(buffer)
			this.disableLightingTop = legacy === 1 ? 1 : Math.min(legacy / 255, 1)
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

/** Hit target state — drop offset, rotation and appearance.
 * @see https://github.com/vpinball/vpinball/blob/master/hittarget.cpp */
export class HitTargetState extends ItemState {
	public zOffset = 0
	public xRotation = 0
	public material?: string
	public texture?: string
	/** Engine drop flag (`HitTarget::m_d.m_isDropped`); visuals key off zOffset/xRotation, this mirrors script state. */
	public isDropped = false

	public static claim(
		name: string,
		zOffset: number,
		xRotation: number,
		material: string | undefined,
		texture: string | undefined,
		isVisible: boolean,
	): HitTargetState {
		const s = new HitTargetState()
		s.name = name
		s.zOffset = zOffset
		s.xRotation = xRotation
		s.material = material
		s.texture = texture
		s.isVisible = isVisible
		return s
	}
}

/** Static render entry for a hit target mesh (WASM-side scene generation). */
export interface HitTargetMeshEntry {
	isVisible: boolean
	mesh?: Mesh
	material?: Material
	map?: Texture
	isTransparent?: boolean
	depthBias?: number
	disableLighting?: number
	disableLightingBelow?: number
}

/** @see https://github.com/vpinball/vpinball/blob/master/hittarget.cpp */
export class HitTarget extends Item<HitTargetData> {
	private readonly state: HitTargetState
	private readonly meshGenerator: HitTargetMeshGenerator
	private readonly updater: HitTargetUpdater

	public static async fromStorage(storage: Storage, itemName: string): Promise<HitTarget> {
		const data = await HitTargetData.fromStorage(storage, itemName)
		return new HitTarget(data)
	}

	public constructor(data: HitTargetData) {
		super(data)
		this.state = HitTargetState.claim(this.data.getName(), 0.0, 0.0, data.szMaterial, data.szImage, data.isVisible)
		this.meshGenerator = new HitTargetMeshGenerator(data)
		this.updater = new HitTargetUpdater(this.data, this.state)
	}

	public getMeshes(table: Table): Record<string, HitTargetMeshEntry> {
		const m = table.getMaterial(this.data.szMaterial)
		const isTransparent = !m || (m.isOpacityActive && m.opacity < 0.999)
		return {
			hitTarget: {
				mesh: this.meshGenerator.getMesh(table).transform(Matrix3D.RIGHT_HANDED),
				isVisible: this.data.isVisible,
				material: m,
				isTransparent,
				map: table.getTexture(this.data.szImage),
				depthBias: this.data.depthBias,
				disableLighting: this.data.disableLightingTop,
				// Seeded at creation: script writes need a bridge column (only prims sync one today).
				disableLightingBelow: this.data.disableLightingBelow,
			},
		}
	}

	public getState(): HitTargetState {
		return this.state
	}

	public getUpdater(): HitTargetUpdater {
		return this.updater
	}
}
