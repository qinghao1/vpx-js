// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { degToRad } from '../../math/float.js'
import type { IRenderApi } from '../../render/irender-api.js'
import { ItemUpdater } from '../item-updater.js'
import type { Table } from '../table/table.js'
import type { SpinnerData } from './spinner-data.js'
import type { SpinnerMeshGenerator } from './spinner-mesh-generator.js'
import type { SpinnerState } from './spinner-state.js'

export class SpinnerUpdater extends ItemUpdater<SpinnerState> {
	private readonly data: SpinnerData
	private readonly meshGenerator: SpinnerMeshGenerator

	constructor(state: SpinnerState, data: SpinnerData, meshGenerator: SpinnerMeshGenerator) {
		super(state)
		this.data = data
		this.meshGenerator = meshGenerator
	}

	public applyState<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: SpinnerState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): void {
		// update local state
		Object.assign(this.state, state)

		this.applyVisibility(obj, state, renderApi)
		this.applyMaterial(obj, state.material, state.texture, renderApi, table)

		if (state.showBracket !== undefined) {
			renderApi.applyVisibility(state.showBracket, renderApi.findInGroup(obj, `spinner.bracket-${state.name}`))
		}

		if (state.angle !== undefined) {
			this.applyXRotation(
				obj,
				renderApi,
				this.data.center,
				this.meshGenerator.getZ(table),
				this.data.rotation,
				state.angle - degToRad(this.data.angleMin),
				`spinner.plate-${this.state.getName()}`,
			)
		}
	}
}
