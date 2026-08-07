// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Enums } from '../enums.js'
import { ItemState } from '../item-state.js'
import { omitEqual } from '../state-helpers.js'

/** Kicker state — type and material.
 * @see https://github.com/vpinball/vpinball/blob/master/kicker.cpp */
export class KickerState extends ItemState {
	public type!: number
	public material?: string

	// @ts-expect-error — derived visibility from type
	get isVisible(): boolean {
		return this.type !== Enums.KickerType.KickerInvisible
	}
	set isVisible(_v: boolean) {}

	public constructor() {
		super()
	}

	public static claim(name: string, type: number, material: string | undefined): KickerState {
		const s = new KickerState()
		s.name = name
		s.type = type
		s.material = material
		return s
	}

	public clone(): KickerState {
		return KickerState.claim(this.name, this.type, this.material)
	}

	public diff(state: KickerState): KickerState {
		const d = this.clone()
		omitEqual(d, state, 'type')
		omitEqual(d, state, 'material')
		return d
	}

	public release(): void {}

	public equals(state: KickerState): boolean {
		if (!state) return false
		return state.type === this.type && state.material === this.material
	}
}
