// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Pool } from '../../util/object-pool.js'
import { ItemState } from '../item-state.js'

export /** TriggerState. */
class TriggerState extends ItemState {
	public static readonly POOL = new Pool(TriggerState)

	public heightOffset: number = 0
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
		const state = TriggerState.POOL.get()
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
		if (diff.heightOffset === state.heightOffset) {
			delete diff.heightOffset
		}
		if (diff.material === state.material) {
			delete diff.material
		}
		if (diff.isVisible === state.isVisible) {
			delete diff.isVisible
		}
		return diff
	}

	public release(): void {
		TriggerState.POOL.release(this)
	}

	public equals(state: TriggerState): boolean {
		/* istanbul ignore if: we don't actually pass empty states. */
		if (!state) {
			return false
		}
		return (
			state.heightOffset === this.heightOffset && state.material === this.material && state.isVisible === this.isVisible
		)
	}
}
