// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Matrix3D } from '../../math/matrix3d.js'
import type { IRenderApi } from '../../render/irender-api.js'
import { ItemUpdater } from '../item-updater.js'
import type { Table } from '../table/table.js'
import type { TriggerState } from './trigger-state.js'

export /** TriggerUpdater. */
class TriggerUpdater extends ItemUpdater<TriggerState> {
	constructor(state: TriggerState) {
		super(state)
	}

	public applyState<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: TriggerState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): void {
		// update local state
		Object.assign(this.state, state)

		this.applyVisibility(obj, state, renderApi)
		this.applyMaterial(obj, state.material, undefined, renderApi, table)
		this.applyAnimation(obj, state, renderApi)
	}

	private applyAnimation<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: TriggerState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
	): void {
		if (state.heightOffset !== undefined) {
			const matrix = Matrix3D.claim().setTranslation(0, 0, -state.heightOffset)
			renderApi.applyMatrixToNode(matrix, obj)
			Matrix3D.release(matrix)
		}
	}
}
