// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { ItemState } from '../item-state.js'

/** @see https://github.com/vpinball/vpinball/blob/master/spinner.cpp */
export class SpinnerState extends ItemState {
	public angle = 0
	public texture?: string
	public material?: string
	public showBracket = true

	public static claim(
		name: string,
		angle: number,
		texture: string | undefined,
		material: string | undefined,
		showBracket: boolean,
		isVisible: boolean,
	): SpinnerState {
		const state = new SpinnerState()
		state.name = name
		state.angle = angle
		state.texture = texture
		state.material = material
		state.showBracket = showBracket
		state.isVisible = isVisible
		return state
	}
}
