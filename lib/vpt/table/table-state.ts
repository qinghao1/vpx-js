// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { ItemState } from '../item-state.js'
import { omitEqual } from '../state-helpers.js'

/** Table render state. @see https://github.com/vpinball/vpinball/blob/master/table.cpp */
export class TableState extends ItemState {
	public material?: string

	public static claim(name: string, material: string | undefined, isVisible: boolean): TableState {
		const state = new TableState()
		state.name = name
		state.material = material
		state.isVisible = isVisible
		return state
	}

	public clone(): TableState {
		return TableState.claim(this.name, this.material, this.isVisible)
	}

	public override copyFrom(state: ItemState): void {
		const s = state as TableState
		this.name = s.name
		this.material = s.material
		this.isVisible = s.isVisible
	}

	public diff(state: TableState): TableState {
		const diff = this.clone()
		omitEqual(diff, state, 'material')
		omitEqual(diff, state, 'isVisible')
		return diff
	}

	public release(): void {}

	public equals(state: TableState): boolean {
		if (!state) return false
		return state.material === this.material && state.isVisible === this.isVisible
	}
}
