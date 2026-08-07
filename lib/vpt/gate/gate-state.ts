// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Pool } from '../../util/object-pool.js'
import { ItemState } from '../item-state.js'
import { omitEqual } from '../state-helpers.js'

/** Gate state — angle, material, bracket visibility.
 * @see https://github.com/vpinball/vpinball/blob/master/gate.cpp */
export class GateState extends ItemState {
	public static readonly POOL = new Pool(GateState)

	public angle = 0
	public material?: string
	public showBracket = true

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
		const s = GateState.POOL.get()
		s.name = name
		s.angle = angle
		s.material = material
		s.showBracket = showBracket
		s.isVisible = isVisible
		return s
	}

	public clone(): GateState {
		return GateState.claim(this.name, this.angle, this.material, this.showBracket, this.isVisible)
	}

	public diff(state: GateState): GateState {
		const d = this.clone()
		omitEqual(d, state, 'angle')
		omitEqual(d, state, 'material')
		omitEqual(d, state, 'showBracket')
		omitEqual(d, state, 'isVisible')
		return d
	}

	public release(): void {
		GateState.POOL.release(this)
	}

	public equals(state: GateState): boolean {
		if (!state) return false
		return (
			state.angle === this.angle &&
			state.material === this.material &&
			state.showBracket === this.showBracket &&
			state.isVisible === this.isVisible
		)
	}
}
