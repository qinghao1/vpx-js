// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Storage } from '../../io/ole-doc.js'
import { Matrix3D } from '../../math/matrix.js'
import type { Meshes } from '../../render/irender-api.js'
import { Enums } from '../enums.js'
import { Item } from '../item.js'
import type { Table } from '../table/table.js'
import { TriggerData } from './trigger-data.js'
import { TriggerMeshGenerator } from './trigger-mesh-generator.js'
import { TriggerState } from './trigger-state.js'
import { TriggerUpdater } from './trigger-updater.js'

/** @see https://github.com/vpinball/vpinball/blob/master/trigger.cpp */
export class Trigger extends Item<TriggerData> {
	private readonly state: TriggerState
	private readonly meshGenerator: TriggerMeshGenerator
	private readonly updater: TriggerUpdater

	public static async fromStorage(storage: Storage, itemName: string): Promise<Trigger> {
		const data = await TriggerData.fromStorage(storage, itemName)
		return new Trigger(data)
	}

	public constructor(data: TriggerData) {
		super(data)
		this.state = TriggerState.claim(
			data.getName(),
			0,
			data.szMaterial,
			data.isVisible && data.shape !== Enums.TriggerShape.TriggerNone,
		)
		this.meshGenerator = new TriggerMeshGenerator(data)
		this.updater = new TriggerUpdater(this.state)
	}

	public getState(): TriggerState {
		return this.state
	}

	public getMeshes<GEOMETRY>(table: Table): Meshes<GEOMETRY> {
		return {
			trigger: {
				isVisible: this.data.isVisible,
				mesh: this.meshGenerator.getMesh(table).transform(Matrix3D.RIGHT_HANDED),
				material: table.getMaterial(this.data.szMaterial),
			},
		}
	}

	public getUpdater(): TriggerUpdater {
		return this.updater
	}
}
