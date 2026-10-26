// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { ItemState } from '../item-state.js'

/** Table render state. @see https://github.com/vpinball/vpinball/blob/master/src/parts/pintable.cpp */
export class TableState extends ItemState {
	public material?: string

	public static claim(name: string, material: string | undefined, isVisible: boolean): TableState {
		const state = new TableState()
		state.name = name
		state.material = material
		state.isVisible = isVisible
		return state
	}
}
