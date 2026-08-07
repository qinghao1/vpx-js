// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Pool } from '../../util/object-pool.js'
import { ItemState } from '../item-state.js'

export class RubberState extends ItemState {
	public static readonly POOL = new Pool(RubberState)

	public height!: number
	public rotX!: number
	public rotY!: number
	public rotZ!: number
	public material?: string
	public texture?: string

	public constructor() {
		super()
	}

	public static claim(
		name: string,
		height: number,
		rotX: number,
		rotY: number,
		rotZ: number,
		material: string | undefined,
		texture: string | undefined,
		isVisible: boolean,
	): RubberState {
		const state = RubberState.POOL.get()
		state.name = name
		state.height = height
		state.rotX = rotX
		state.rotY = rotY
		state.rotZ = rotZ
		state.material = material
		state.texture = texture
		state.isVisible = isVisible
		return state
	}

	public clone(): RubberState {
		return RubberState.claim(
			this.name,
			this.height,
			this.rotX,
			this.rotY,
			this.rotZ,
			this.material,
			this.texture,
			this.isVisible,
		)
	}

	public diff(state: RubberState): RubberState {
		const diff = this.clone()
		if (diff.height === state.height) {
			delete diff.height
		}
		if (diff.rotX === state.rotX) {
			delete diff.rotX
		}
		if (diff.rotY === state.rotY) {
			delete diff.rotY
		}
		if (diff.rotZ === state.rotZ) {
			delete diff.rotZ
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
		RubberState.POOL.release(this)
	}

	public equals(state: RubberState): boolean {
		/* istanbul ignore if: we don't actually pass empty states. */
		if (!state) {
			return false
		}
		return (
			state.height === this.height &&
			state.rotX === this.rotX &&
			state.rotY === this.rotY &&
			state.rotZ === this.rotZ &&
			state.material === this.material &&
			state.texture === this.texture &&
			state.isVisible === this.isVisible
		)
	}
}
