// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { Matrix3D } from '../../math/matrix.js'
import { Vertex2D } from '../../math/vector.js'
import type { Meshes, RenderInfo } from '../../render/irender-api.js'
import { type BiffFieldMap, handleBiffTag } from '../biff-helper.js'
import { Item } from '../item.js'
import { ItemData } from '../item-data.js'
import { ItemState } from '../item-state.js'
import type { Material } from '../material.js'
import type { Mesh } from '../mesh.js'
import type { Table } from '../table/table.js'
import { Texture } from '../texture.js'
import { BumperMeshGenerator, BumperUpdater } from './bumper-view.js'

const FLOAT_TAGS: BiffFieldMap<BumperData> = {
	RADI: 'radius',
	THRS: 'threshold',
	FORC: 'force',
	BSCT: 'scatter',
	HISC: 'heightScale',
	RISP: 'ringSpeed',
	ORIN: 'orientation',
	RDLI: 'ringDropOffset',
}
const STRING_TAGS: BiffFieldMap<BumperData> = {
	MATR: 'szCapMaterial',
	RIMA: 'szRingMaterial',
	BAMA: 'szBaseMaterial',
	SKMA: 'szSkirtMaterial',
	SURF: 'szSurface',
}
const BOOL_TAGS: BiffFieldMap<BumperData> = {
	CAVI: 'isCapVisible',
	HAHE: 'hitEvent',
	COLI: 'isCollidable',
	RIVS: 'isRingVisible',
	SKVS: 'isSkirtVisible',
	REEN: 'isReflectionEnabled',
}

/** @see https://github.com/vpinball/vpinball/blob/master/bumper.cpp */
export class BumperData extends ItemData {
	public center!: Vertex2D
	public radius = 45
	public szCapMaterial?: string
	public szRingMaterial?: string
	public szBaseMaterial?: string
	public szSkirtMaterial?: string
	public threshold = 1.0
	public force = 15.0
	public scatter = 0
	public heightScale = 90.0
	public ringSpeed = 0.5
	public orientation = 0.0
	public ringDropOffset = 0.0
	public szSurface?: string
	public isCapVisible = true
	public isBaseVisible = true
	public isRingVisible = true
	public isSkirtVisible = true
	public hitEvent = true
	public isCollidable = true
	public isReflectionEnabled = true

	public static async fromStorage(storage: Storage, itemName: string): Promise<BumperData> {
		const d = new BumperData(itemName)
		await storage.streamFiltered(itemName, 4, BiffParser.stream(d.fromTag.bind(d)))
		return d
	}

	public constructor(itemName: string) {
		super(itemName)
	}

	private async fromTag(buffer: Uint8Array, tag: string, _offset: number, len: number): Promise<number> {
		if (tag === 'VCEN') {
			this.center = Vertex2D.get(buffer)
			return 0
		}
		if (
			handleBiffTag(this, tag, buffer, len, {
				float: FLOAT_TAGS,
				string: STRING_TAGS,
				bool: BOOL_TAGS,
			})
		)
			return 0
		switch (tag) {
			case 'BVIS': {
				const v = this.getBool(buffer)
				this.isCapVisible = this.isBaseVisible = this.isRingVisible = this.isSkirtVisible = v
				break
			}
			case 'BSVS': {
				const v = this.getBool(buffer)
				this.isBaseVisible = this.isRingVisible = this.isSkirtVisible = v
				break
			}
			default:
				this.getCommonBlock(buffer, tag, len)
				break
		}
		return 0
	}
}

/** Bumper state — ring offset, skirt rotation and material visibility.
 * @see https://github.com/vpinball/vpinball/blob/master/bumper.cpp */
export class BumperState extends ItemState {
	public ringOffset = 0
	public skirtRotX = 0
	public skirtRotY = 0
	public isCapVisible = true
	public isRingVisible = true
	public isBaseVisible = true
	public isSkirtVisible = true
	public capMaterial?: string
	public ringMaterial?: string
	public baseMaterial?: string
	public skirtMaterial?: string

	// @ts-expect-error — derived visibility from part flags
	get isVisible(): boolean {
		return this.isCapVisible || this.isRingVisible || this.isBaseVisible || this.isSkirtVisible
	}
	set isVisible(visible: boolean) {
		this.isCapVisible = this.isRingVisible = this.isBaseVisible = this.isSkirtVisible = visible
	}

	public static claim(
		name: string,
		ringOffset: number,
		skirtRotX: number,
		skirtRotY: number,
		isCapVisible: boolean,
		isRingVisible: boolean,
		isBaseVisible: boolean,
		isSkirtVisible: boolean,
		capMaterial: string | undefined,
		ringMaterial: string | undefined,
		baseMaterial: string | undefined,
		skirtMaterial: string | undefined,
	): BumperState {
		const s = new BumperState()
		s.name = name
		s.ringOffset = ringOffset
		s.skirtRotX = skirtRotX
		s.skirtRotY = skirtRotY
		s.isCapVisible = isCapVisible
		s.isRingVisible = isRingVisible
		s.isBaseVisible = isBaseVisible
		s.isSkirtVisible = isSkirtVisible
		s.capMaterial = capMaterial
		s.ringMaterial = ringMaterial
		s.baseMaterial = baseMaterial
		s.skirtMaterial = skirtMaterial
		return s
	}
}

/** @see https://github.com/vpinball/vpinball/blob/master/bumper.cpp */
export class Bumper extends Item<BumperData> {
	private readonly meshGenerator: BumperMeshGenerator
	private readonly state: BumperState
	private readonly updater: BumperUpdater

	public static async fromStorage(storage: Storage, itemName: string): Promise<Bumper> {
		const data = await BumperData.fromStorage(storage, itemName)
		return new Bumper(data)
	}

	public constructor(data: BumperData) {
		super(data)
		this.state = BumperState.claim(
			this.getName(),
			0,
			0,
			0,
			data.isCapVisible,
			data.isRingVisible,
			data.isBaseVisible,
			data.isSkirtVisible,
			data.szCapMaterial,
			data.szRingMaterial,
			data.szBaseMaterial,
			data.szSkirtMaterial,
		)
		this.meshGenerator = new BumperMeshGenerator(data)
		this.updater = new BumperUpdater(this.state, this.data)
	}

	public isCollidable(): boolean {
		return this.data.isCollidable
	}

	public getMeshes<GEOMETRY>(table: Table): Meshes<GEOMETRY> {
		const m = this.meshGenerator.getMeshes(table)
		const mat = (name?: string) => table.getMaterial(name)
		return {
			base: {
				isVisible: this.data.isBaseVisible,
				mesh: m.base.transform(Matrix3D.RIGHT_HANDED),
				material: mat(this.data.szBaseMaterial),
				map: Texture.fromFilesystem('bumperbase.png'),
			},
			ring: {
				isVisible: this.data.isRingVisible,
				mesh: m.ring.transform(Matrix3D.RIGHT_HANDED),
				material: mat(this.data.szRingMaterial),
				map: Texture.fromFilesystem('bumperring.png'),
			},
			skirt: {
				isVisible: this.data.isSkirtVisible,
				mesh: m.skirt.transform(Matrix3D.RIGHT_HANDED),
				material: mat(this.data.szSkirtMaterial),
				map: Texture.fromFilesystem('bumperskirt.png'),
			},
			cap: {
				isVisible: this.data.isCapVisible,
				mesh: m.cap.transform(Matrix3D.RIGHT_HANDED),
				material: mat(this.data.szCapMaterial),
				map: Texture.fromFilesystem('bumperCap.png'),
			},
		}
	}

	public getState(): BumperState {
		return this.state
	}

	public getUpdater(): BumperUpdater {
		return this.updater
	}
}
