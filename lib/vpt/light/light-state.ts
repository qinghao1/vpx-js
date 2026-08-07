// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Pool } from '../../util/object-pool.js'
import { ItemState } from '../item-state.js'
import { omitEqual } from '../state-helpers.js'

/** Light state.
 * @see https://github.com/vpinball/vpinball/blob/master/light.cpp */
export class LightState extends ItemState {
	public static readonly POOL = new Pool(LightState)

	public intensity = 0
	public color: number = 0
	public colorFull: number = 0

	public constructor() {
		super()
	}

	public static claim(name: string, intensity: number, color: number, colorFull: number): LightState {
		const state = LightState.POOL.get()
		state.name = name
		state.intensity = intensity
		state.color = color
		state.colorFull = colorFull
		return state
	}

	public clone(): LightState {
		return LightState.claim(this.name, this.intensity, this.color, this.colorFull)
	}

	public diff(state: LightState): LightState {
		const diff = this.clone()
		omitEqual(diff, state, 'intensity')
		omitEqual(diff, state, 'color')
		omitEqual(diff, state, 'colorFull')
		return diff
	}

	public release(): void {
		LightState.POOL.release(this)
	}

	public equals(state: LightState): boolean {
		if (!state) {
			return false
		}
		return state.intensity === this.intensity && state.color === this.color && state.colorFull === this.colorFull
	}
}
