// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Storage } from '../../io/ole-doc.js'
import { Item } from '../item.js'
import type { Material } from '../material.js'
import type { Mesh } from '../mesh.js'
import type { Table } from '../table/table.js'
import type { Texture } from '../texture.js'
import { PlungerData } from './plunger-data.js'
import { PlungerMeshGenerator } from './plunger-mesh-generator.js'
import { PlungerState } from './plunger-state.js'
import { PlungerUpdater } from './plunger-updater.js'

/** Static render entry for a plunger mesh (WASM-side scene generation). */
export interface PlungerMeshEntry {
	isVisible: boolean
	mesh?: Mesh
	material?: Material
	map?: Texture
}

/** @see https://github.com/vpinball/vpinball/blob/master/plunger.cpp */
export class Plunger extends Item<PlungerData> {
	public static PLUNGER_HEIGHT = 50

	private readonly meshGenerator: PlungerMeshGenerator
	private readonly state: PlungerState
	private readonly updater: PlungerUpdater

	public static async fromStorage(storage: Storage, itemName: string): Promise<Plunger> {
		const data = await PlungerData.fromStorage(storage, itemName)
		return new Plunger(itemName, data)
	}

	public constructor(_itemName: string, data: PlungerData) {
		super(data)
		this.meshGenerator = new PlungerMeshGenerator(data)
		this.state = PlungerState.claim(this.getName(), 0, data.isVisible)
		this.updater = new PlungerUpdater(this.state, this.meshGenerator)
	}

	public getState(): PlungerState {
		return this.state
	}

	public getMeshes<GEOMETRY>(table: Table): Record<string, PlungerMeshEntry> {
		const plunger = this.meshGenerator.generateMeshes(0, table)
		const meshes: Record<string, PlungerMeshEntry> = {}
		const material = table.getMaterial(this.data.szMaterial)
		const map = table.getTexture(this.data.szImage)
		if (plunger.rod) meshes.rod = { isVisible: this.data.isVisible, mesh: plunger.rod, material, map }
		if (plunger.spring) meshes.spring = { isVisible: this.data.isVisible, mesh: plunger.spring, material, map }
		if (plunger.flat) meshes.flat = { isVisible: this.data.isVisible, mesh: plunger.flat, material, map }
		return meshes
	}

	public isCollidable(): boolean {
		return true
	}

	public getUpdater(): PlungerUpdater {
		return this.updater
	}
}

export interface PlungerConfig {
	x: number
	y: number
	x2: number
	zHeight: number
	frameTop: number
	frameBottom: number
	cFrames: number
}
