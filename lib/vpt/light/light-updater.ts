// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { IRenderApi } from '../../render/irender-api.js'
import { ItemUpdater } from '../item-updater.js'
import type { Table } from '../table/table.js'
import type { LightData } from './light-data.js'
import type { LightState } from './light-state.js'

/** Light updater — intensity and color. */
export class LightUpdater extends ItemUpdater<LightState> {
	constructor(
		private readonly data: LightData,
		state: LightState,
	) {
		super(state)
	}

	public applyState<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: LightState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): void {
		Object.assign(this.state, state)
		renderApi.applyLighting(this.state, this.data.intensity, obj)
	}
}
