// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Pool } from '../../util/object-pool.js'
import { ItemState } from '../item-state.js'

export class TableState extends ItemState {
	public static readonly POOL = new Pool(TableState)

	public material?: string

	public constructor() {
		super()
	}

	public static claim(name: string, material: string | undefined, isVisible: boolean): TableState {
		const state = TableState.POOL.get()
		state.name = name
		state.material = material
		state.isVisible = isVisible
		return state
	}

	public clone(): TableState {
		return TableState.claim(this.name, this.material, this.isVisible)
	}

	public diff(state: TableState): TableState {
		const diff = this.clone()
		if (diff.material === state.material) {
			delete diff.material
		}
		if (diff.isVisible === state.isVisible) {
			delete diff.isVisible
		}
		return diff
	}

	public release(): void {
		TableState.POOL.release(this)
	}

	public equals(state: TableState): boolean {
		/* istanbul ignore if: we don't actually pass empty states. */
		if (!state) {
			return false
		}
		return state.material === this.material && state.isVisible === this.isVisible
	}
}
