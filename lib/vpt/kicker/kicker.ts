// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { Matrix3D } from '../../math/matrix.js'
import { Vertex2D } from '../../math/vector.js'
import { type BiffFieldMap, handleBiffTag } from '../biff-helper.js'
import { Enums } from '../enums.js'
import { Item } from '../item.js'
import { ItemData } from '../item-data.js'
import { ItemState } from '../item-state.js'
import type { Material } from '../material.js'
import type { Mesh } from '../mesh.js'
import type { Table } from '../table/table.js'
import { Texture } from '../texture.js'
import { KickerMeshGenerator, KickerUpdater } from './kicker-view.js'

const FLOAT_MAP: BiffFieldMap<KickerData> = {
	RADI: 'radius',
	KSCT: 'scatter',
	KHAC: 'hitAccuracy',
	KHHI: 'hitHeight',
	KORI: 'orientation',
}
const BOOL_MAP: BiffFieldMap<KickerData> = { EBLD: 'isEnabled', FATH: 'fallThrough', LEMO: 'legacyMode' }
const STRING_MAP: BiffFieldMap<KickerData> = { MATR: 'szMaterial', SURF: 'szSurface' }

/** @see https://github.com/vpinball/vpinball/blob/master/kicker.cpp */
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

	public constructor(itemName: string) {
		super(itemName)
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

/** Kicker state — type and material.
 * @see https://github.com/vpinball/vpinball/blob/master/kicker.cpp */
export class KickerState extends ItemState {
	public type!: number
	public material?: string

	// @ts-expect-error — derived visibility from type
	get isVisible(): boolean {
		return this.type !== Enums.KickerType.KickerInvisible
	}
	set isVisible(_v: boolean) {}

	public static claim(name: string, type: number, material: string | undefined): KickerState {
		const s = new KickerState()
		s.name = name
		s.type = type
		s.material = material
		return s
	}
}

/** Static render entry for a kicker mesh (WASM-side scene generation). */
export interface KickerMeshEntry {
	isVisible: boolean
	mesh?: Mesh
	material?: Material
	map?: Texture
}

/** @see https://github.com/vpinball/vpinball/blob/master/kicker.cpp */
export class Kicker extends Item<KickerData> {
	private readonly meshGenerator: KickerMeshGenerator
	private readonly state: KickerState
	private readonly updater: KickerUpdater

	public static async fromStorage(storage: Storage, itemName: string): Promise<Kicker> {
		const data = await KickerData.fromStorage(storage, itemName)
		return new Kicker(data)
	}

	public constructor(data: KickerData) {
		super(data)
		this.state = KickerState.claim(data.getName(), data.kickerType, data.szMaterial)
		this.meshGenerator = new KickerMeshGenerator(data)
		this.updater = new KickerUpdater(this.state)
	}

	public isCollidable(): boolean {
		return true
	}

	public getMeshes<GEOMETRY>(table: Table): Record<string, KickerMeshEntry> {
		return {
			kicker: {
				isVisible: this.data.kickerType !== Enums.KickerType.KickerInvisible,
				mesh: this.meshGenerator.getMesh(table).transform(Matrix3D.RIGHT_HANDED),
				material: table.getMaterial(this.data.szMaterial),
				map: this.getTexture(),
			},
		}
	}

	public getState(): KickerState {
		return this.state
	}

	public getUpdater(): KickerUpdater {
		return this.updater
	}

	private getTexture(): Texture {
		switch (this.data.kickerType) {
			case Enums.KickerType.KickerCup:
				return Texture.fromFilesystem('kickerCup.png')
			case Enums.KickerType.KickerWilliams:
				return Texture.fromFilesystem('kickerWilliams.png')
			case Enums.KickerType.KickerGottlieb:
				return Texture.fromFilesystem('kickerGottlieb.png')
			case Enums.KickerType.KickerCup2:
				return Texture.fromFilesystem('kickerT1.png')
			default:
				return Texture.fromFilesystem('kickerHoleWood.png')
		}
	}
}
