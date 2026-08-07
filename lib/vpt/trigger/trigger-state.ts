// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { ItemState } from '../item-state.js'
import { omitEqual } from '../state-helpers.js'

/** Trigger state. @see https://github.com/vpinball/vpinball/blob/master/trigger.cpp */
export class TriggerState extends ItemState {
	public heightOffset = 0
	public material?: string

	public constructor() {
		super()
	}

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

	public clone(): TriggerState {
		return TriggerState.claim(this.name, this.heightOffset, this.material, this.isVisible)
	}

	public diff(state: TriggerState): TriggerState {
		const diff = this.clone()
		omitEqual(diff, state, 'heightOffset')
		omitEqual(diff, state, 'material')
		omitEqual(diff, state, 'isVisible')
		return diff
	}

	public release(): void {}

	public equals(state: TriggerState): boolean {
		if (!state) return false
		return (
			state.heightOffset === this.heightOffset && state.material === this.material && state.isVisible === this.isVisible
		)
	}
}
