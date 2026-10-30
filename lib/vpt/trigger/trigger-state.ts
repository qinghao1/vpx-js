// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { ItemState } from '../item-state.js'

/** @see https://github.com/vpinball/vpinball/blob/master/trigger.cpp */
export class TriggerState extends ItemState {
	public heightOffset = 0
	public material?: string

	public static claim(
		name: string,
		heightOffset: number,
		material: string | undefined,
		isVisible: boolean,
	): TriggerState {
		const state = new TriggerState()
		state.name = name
		state.heightOffset = heightOffset
		state.material = material
		state.isVisible = isVisible
		return state
	}
}
