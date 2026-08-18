// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { ItemState } from '../item-state.js'
import { omitEqual } from '../state-helpers.js'

/** Plunger state. @see https://github.com/vpinball/vpinball/blob/master/plunger.cpp */
export class PlungerState extends ItemState {
	public frame = 0

	public static claim(name: string, frame: number): PlungerState {
		const state = new PlungerState()
		state.name = name
		state.frame = frame
		return state
	}

	public clone(): PlungerState {
		return PlungerState.claim(this.name, this.frame)
	}

	public diff(state: PlungerState): PlungerState {
		const diff = this.clone()
		omitEqual(diff, state, 'frame')
		return diff
	}

	public release(): void {}

	public equals(state: PlungerState): boolean {
		if (!state) return false
		return state.frame === this.frame
	}
}
