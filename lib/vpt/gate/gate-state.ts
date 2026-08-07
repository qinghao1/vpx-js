// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Pool } from '../../util/object-pool.js'
import { ItemState } from '../item-state.js'

/** Gate state.
 *
 * @see https://github.com/vpinball/vpinball/blob/master/gate.cpp */
export class GateState extends ItemState {
	public static readonly POOL = new Pool(GateState)

	/**
	 * Angle in rad
	 */
	public angle: number = 0
	public material?: string
	public showBracket: boolean = true

	public constructor() {
		super()
	}

	public static claim(
		name: string,
		angle: number,
		material: string | undefined,
		showBracket: boolean,
		isVisible: boolean,
	): GateState {
		const state = GateState.POOL.get()
		state.name = name
		state.angle = angle
		state.material = material
		state.showBracket = showBracket
		state.isVisible = isVisible
		return state
	}

	public clone(): GateState {
		return GateState.claim(this.name, this.angle, this.material, this.showBracket, this.isVisible)
	}

	public diff(state: GateState): GateState {
		const diff = this.clone()
		if (diff.angle === state.angle) {
			delete diff.angle
		}
		if (diff.isVisible === state.isVisible) {
			delete diff.isVisible
		}
		if (diff.material === state.material) {
			delete diff.material
		}
		if (diff.showBracket === state.showBracket) {
			delete diff.showBracket
		}
		if (diff.isVisible === state.isVisible) {
			delete diff.isVisible
		}
		return diff
	}

	public release(): void {
		GateState.POOL.release(this)
	}

	public equals(state: GateState): boolean {
		/* istanbul ignore if: we don't actually pass empty states. */
		if (!state) {
			return false
		}
		return (
			state.angle === this.angle &&
			state.material === this.material &&
			state.showBracket === this.showBracket &&
			state.isVisible === this.isVisible
		)
	}
}
