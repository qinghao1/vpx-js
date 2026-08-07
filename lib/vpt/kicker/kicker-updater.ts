// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { IRenderApi } from '../../render/irender-api.js'
import { ItemUpdater } from '../item-updater.js'
import type { Table } from '../table/table.js'
import type { KickerState } from './kicker-state.js'

export /** KickerUpdater. */
class KickerUpdater extends ItemUpdater<KickerState> {
	constructor(state: KickerState) {
		super(state)
	}

	public applyState<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: KickerState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): void {
		// update local state
		Object.assign(this.state, state)

		// visibility
		if (state.type !== undefined) {
			renderApi.applyVisibility(this.state.isVisible, obj)
		}

		this.applyMaterial(obj, state.material, undefined, renderApi, table)
	}
}
