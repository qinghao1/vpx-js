// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import type { Storage } from '../../io/ole-doc.js'
import { Matrix3D } from '../../math/matrix.js'
import { Item } from '../item.js'
import type { Material } from '../material.js'
import type { Mesh } from '../mesh.js'
import type { Table } from '../table/table.js'
import { GateData } from './gate-data.js'
import { GateMeshGenerator } from './gate-mesh-generator.js'
import { GateState } from './gate-state.js'
import { GateUpdater } from './gate-updater.js'

/** Static render entry for a gate mesh (WASM-side scene generation). */
export interface GateMeshEntry {
	isVisible: boolean
	mesh?: Mesh
	material?: Material
}

/** @see https://github.com/vpinball/vpinball/blob/master/gate.cpp */
export class Gate extends Item<GateData> {
	private readonly meshGenerator: GateMeshGenerator
	private readonly state: GateState
	private readonly updater: GateUpdater

	public static async fromStorage(storage: Storage, itemName: string): Promise<Gate> {
		const data = await GateData.fromStorage(storage, itemName)
		return new Gate(data)
	}

	public constructor(data: GateData) {
		super(data)
		this.state = GateState.claim(this.getName(), 0, data.szMaterial, data.showBracket, data.isVisible)
		this.meshGenerator = new GateMeshGenerator(data)
		this.updater = new GateUpdater(this.data, this.state)
	}

	public isCollidable(): boolean {
		return this.data.isCollidable
	}

	public getMeshes<GEOMETRY>(table: Table): Record<string, GateMeshEntry> {
		const gate = this.meshGenerator.getMeshes(table)
		return {
			wire: {
				isVisible: this.data.isVisible,
				mesh: gate.wire.transform(Matrix3D.RIGHT_HANDED),
				material: table.getMaterial(this.data.szMaterial),
			},
			bracket: {
				isVisible: this.data.isVisible && this.data.showBracket,
				mesh: gate.bracket.transform(Matrix3D.RIGHT_HANDED),
				material: table.getMaterial(this.data.szMaterial),
			},
		}
	}

	public getState(): GateState {
		return this.state
	}

	public getUpdater(): GateUpdater {
		return this.updater
	}
}
