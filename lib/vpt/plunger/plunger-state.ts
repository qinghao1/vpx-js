// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Pool } from '../../util/object-pool.js'
import { ItemState } from '../item-state.js'

/** Plunger state.
 * @see https://github.com/vpinball/vpinball/blob/master/plunger.cpp */
export class PlungerState extends ItemState {
	public static readonly POOL = new Pool(PlungerState)

	/**
	 * Which frame to render
	 */
	public frame: number = 0

	public constructor() {
		super()
	}

	public static claim(name: string, frame: number): PlungerState {
		const state = PlungerState.POOL.get()
		state.name = name
		state.frame = frame
		return state
	}

	public clone(): PlungerState {
		return PlungerState.claim(this.name, this.frame)
	}

	public diff(state: PlungerState): PlungerState {
		const diff = this.clone()
		if (diff.frame === state.frame) {
			delete diff.frame
		}
		return diff
	}

	public release(): void {
		PlungerState.POOL.release(this)
	}

	public equals(state: PlungerState): boolean {
		if (!state) {
			return false
		}
		return state.frame === this.frame
	}
}
