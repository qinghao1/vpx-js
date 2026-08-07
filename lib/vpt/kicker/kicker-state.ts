// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Pool } from '../../util/object-pool.js'
import { Enums } from '../enums.js'
import { ItemState } from '../item-state.js'

export class KickerState extends ItemState {
	public static readonly POOL = new Pool(KickerState)

	public type!: number
	public material?: string

	// @ts-expect-error
	get isVisible(): boolean {
		return this.type !== Enums.KickerType.KickerInvisible
	}
	set isVisible(v) {
		/* not used in abstract */
	}

	public constructor() {
		super()
	}

	public static claim(name: string, type: number, material: string | undefined): KickerState {
		const state = KickerState.POOL.get()
		state.name = name
		state.type = type
		state.material = material
		return state
	}

	public clone(): KickerState {
		return KickerState.claim(this.name, this.type, this.material)
	}

	public diff(state: KickerState): KickerState {
		const diff = this.clone()
		if (diff.type === state.type) {
			delete diff.type
		}
		if (diff.material === state.material) {
			delete diff.material
		}
		return diff
	}

	public release(): void {
		KickerState.POOL.release(this)
	}

	public equals(state: KickerState): boolean {
		/* istanbul ignore if: we don't actually pass empty states. */
		if (!state) {
			return false
		}
		return state.type === this.type && state.material === this.material
	}
}
