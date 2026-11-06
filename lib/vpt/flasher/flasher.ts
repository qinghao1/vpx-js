// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Storage } from '../../io/ole-doc.js'
import type { IRenderApi, Meshes } from '../../render/irender-api.js'
import { Item } from '../item.js'
import type { Table, TableGenerateOptions } from '../table/table.js'
import { FlasherData } from './flasher-data.js'
import { FlasherMeshGenerator } from './flasher-mesh-generator.js'
import { FlasherState } from './flasher-state.js'
import { FlasherUpdater } from './flasher-updater.js'

/** Runtime flasher. */
export class Flasher extends Item<FlasherData> {
	private readonly state: FlasherState
	private readonly updater: FlasherUpdater
	private readonly meshGenerator = new FlasherMeshGenerator()

	public static async fromStorage(storage: Storage, itemName: string): Promise<Flasher> {
		const data = await FlasherData.fromStorage(storage, itemName)
		return new Flasher(data)
	}

	private constructor(data: FlasherData) {
		super(data)
		this.state = FlasherState.claim(
			data.getName(),
			data.isVisible,
			data.color,
			data.alpha,
			data.rotX,
			data.rotY,
			data.rotZ,
			data.height,
			data.szImageA ?? '',
		)
		this.updater = new FlasherUpdater(this.state, this.data)
	}

	public getState(): FlasherState {
		return this.state
	}

	public getUpdater(): FlasherUpdater {
		return this.updater
	}

	public getMeshes<NODE, GEOMETRY, POINT_LIGHT>(
		table: Table,
		_renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		_opts: TableGenerateOptions,
	): Meshes<GEOMETRY> {
		const mesh = this.meshGenerator.generateMesh(this.data, table)
		if (!mesh) return {}
		const meshes: Meshes<GEOMETRY> = {}
		meshes.flasher = {
			isVisible: this.data.isVisible,
			mesh,
			map: this.data.szImageA ? table.getTexture(this.data.szImageA) : undefined,
			addBlend: this.data.addBlend,
			// Tri-state blend mode; absorb renders premultiplied-over downstream.
			// @see FlasherData::AddBlendMode in src/parts/flasher.h
			addBlendMode: this.data.addBlendMode,
			modulateVsAdd: this.data.modulateVsAdd,
			depthBias: this.data.depthBias,
			isTransparent: true,
			depthWrite: false,
		}
		return meshes
	}
}
