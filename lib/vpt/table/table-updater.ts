// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { IRenderApi } from '../../render/irender-api.js'
import { ItemUpdater } from '../item-updater.js'
import type { Table } from '../table/table.js'
import type { TableState } from './table-state.js'

/** Updates table render state. */
export class TableUpdater extends ItemUpdater<TableState> {
	constructor(state: TableState) {
		super(state)
	}

	public applyState<NODE, GEOMETRY, POINT_LIGHT>(
		_obj: NODE,
		_state: TableState,
		_renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		_table: Table,
	): void {}
}
