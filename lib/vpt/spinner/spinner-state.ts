// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Pool } from '../../util/object-pool.js'
import { ItemState } from '../item-state.js'

/** Spinner state. */
export class SpinnerState extends ItemState {
	public static readonly POOL = new Pool(SpinnerState)

	/**
	 * Angle in rad
	 */
	public angle: number = 0
	public texture?: string
	public material?: string
	public showBracket: boolean = true

	public constructor() {
		super()
	}

	public static claim(
		name: string,
		angle: number,
		texture: string | undefined,
		material: string | undefined,
		showBracket: boolean,
		isVisible: boolean,
	): SpinnerState {
		const state = SpinnerState.POOL.get()
		state.name = name
		state.angle = angle
		state.texture = texture
		state.material = material
		state.showBracket = showBracket
		state.isVisible = isVisible
		return state
	}

	public clone(): SpinnerState {
		return SpinnerState.claim(this.name, this.angle, this.texture, this.material, this.showBracket, this.isVisible)
	}

	public diff(state: SpinnerState): SpinnerState {
		const diff = this.clone()
		if (diff.angle === state.angle) {
			delete diff.angle
		}
		if (diff.texture === state.texture) {
			delete diff.texture
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
		SpinnerState.POOL.release(this)
	}

	public equals(state: SpinnerState): boolean {
		/* istanbul ignore if: we don't actually pass empty states. */
		if (!state) {
			return false
		}
		return (
			state.angle === this.angle &&
			state.texture === this.texture &&
			state.material === this.material &&
			state.showBracket === this.showBracket &&
			state.isVisible === this.isVisible
		)
	}
}
