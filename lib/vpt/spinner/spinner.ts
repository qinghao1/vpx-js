// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Storage } from '../../io/ole-doc.js'
import { Matrix3D } from '../../math/matrix.js'
import type { Meshes } from '../../render/irender-api.js'
import { Item } from '../item.js'
import type { Table } from '../table/table.js'
import { SpinnerData } from './spinner-data.js'
import { SpinnerMeshGenerator } from './spinner-mesh-generator.js'
import { SpinnerState } from './spinner-state.js'
import { SpinnerUpdater } from './spinner-updater.js'

/** @see https://github.com/vpinball/vpinball/blob/master/src/parts/spinner.cpp */
export class Spinner extends Item<SpinnerData> {
	private readonly meshGenerator: SpinnerMeshGenerator
	private readonly state: SpinnerState
	private readonly updater: SpinnerUpdater

	get angleMin() {
		return this.data.angleMin
	}
	get angleMax() {
		return this.data.angleMax
	}

	public static async fromStorage(storage: Storage, itemName: string): Promise<Spinner> {
		const data = await SpinnerData.fromStorage(storage, itemName)
		return new Spinner(data)
	}

	public constructor(data: SpinnerData) {
		super(data)
		this.state = SpinnerState.claim(
			this.data.getName(),
			0,
			data.szImage,
			data.szMaterial,
			data.showBracket,
			data.isVisible,
		)
		this.meshGenerator = new SpinnerMeshGenerator(data)
		this.updater = new SpinnerUpdater(this.state, this.data, this.meshGenerator)
	}

	public isCollidable(): boolean {
		return true
	}

	public getMeshes<GEOMETRY>(table: Table): Meshes<GEOMETRY> {
		const spinner = this.meshGenerator.generateMeshes(table)

		return {
			plate: {
				isVisible: this.data.isVisible,
				mesh: spinner.plate.transform(Matrix3D.RIGHT_HANDED),
				map: table.getTexture(this.data.szImage),
				material: table.getMaterial(this.data.szMaterial),
			},
			bracket: {
				isVisible: this.data.isVisible && this.data.showBracket,
				mesh: spinner.bracket.transform(Matrix3D.RIGHT_HANDED),
				map: table.getTexture(this.data.szImage),
				material: table.getMaterial(this.data.szMaterial),
			},
		}
	}

	public getState(): SpinnerState {
		return this.state
	}

	public getUpdater(): SpinnerUpdater {
		return this.updater
	}
}
