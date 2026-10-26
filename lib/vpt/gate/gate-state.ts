// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { ItemState } from '../item-state.js'

/** Gate state — angle, material, bracket visibility.
 * @see https://github.com/vpinball/vpinball/blob/master/gate.cpp */
export class GateState extends ItemState {
	public angle = 0
	public material?: string
	public showBracket = true

	public static claim(
		name: string,
		angle: number,
		material: string | undefined,
		showBracket: boolean,
		isVisible: boolean,
	): GateState {
		const s = new GateState()
		s.name = name
		s.angle = angle
		s.material = material
		s.showBracket = showBracket
		s.isVisible = isVisible
		return s
	}
}
