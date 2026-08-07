// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { ItemState } from '../item-state.js'
import { omitEqual } from '../state-helpers.js'

/** Rubber state. @see https://github.com/vpinball/vpinball/blob/master/rubber.cpp */
export class RubberState extends ItemState {
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
		const state = new RubberState()
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
		omitEqual(diff, state, 'height')
		omitEqual(diff, state, 'rotX')
		omitEqual(diff, state, 'rotY')
		omitEqual(diff, state, 'rotZ')
		omitEqual(diff, state, 'material')
		omitEqual(diff, state, 'texture')
		omitEqual(diff, state, 'isVisible')
		return diff
	}

	public release(): void {}

	public equals(state: RubberState): boolean {
		if (!state) return false
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
