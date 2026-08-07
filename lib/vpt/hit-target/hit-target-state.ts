// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Pool } from '../../util/object-pool.js'
import { ItemState } from '../item-state.js'

export /** HitTargetState. */
class HitTargetState extends ItemState {
	public static readonly POOL = new Pool(HitTargetState)

	public zOffset: number = 0
	public xRotation: number = 0
	public material?: string
	public texture?: string

	public constructor() {
		super()
	}

	public static claim(
		name: string,
		zOffset: number,
		xRotation: number,
		material: string | undefined,
		texture: string | undefined,
		isVisible: boolean,
	): HitTargetState {
		const state = HitTargetState.POOL.get()
		state.name = name
		state.zOffset = zOffset
		state.xRotation = xRotation
		state.material = material
		state.texture = texture
		state.isVisible = isVisible
		return state
	}

	public clone(): HitTargetState {
		return HitTargetState.claim(this.name, this.zOffset, this.xRotation, this.material, this.texture, this.isVisible)
	}

	public diff(state: HitTargetState): HitTargetState {
		const diff = this.clone()
		if (diff.zOffset === state.zOffset) {
			delete diff.zOffset
		}
		if (diff.xRotation === state.xRotation) {
			delete diff.xRotation
		}
		if (diff.material === state.material) {
			delete diff.material
		}
		if (diff.texture === state.texture) {
			delete diff.texture
		}
		if (diff.isVisible === state.isVisible) {
			delete diff.isVisible
		}
		return diff
	}

	public release(): void {
		HitTargetState.POOL.release(this)
	}

	public equals(state: HitTargetState): boolean {
		/* istanbul ignore if: we don't actually pass empty states. */
		if (!state) {
			return false
		}
		return (
			state.zOffset === this.zOffset &&
			state.xRotation === this.xRotation &&
			state.material === this.material &&
			state.texture === this.texture &&
			state.isVisible === this.isVisible
		)
	}
}
