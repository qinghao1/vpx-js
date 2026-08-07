// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { ItemState } from '../item-state.js'
import { omitEqual } from '../state-helpers.js'

/** Bumper state — ring offset, skirt rotation and material visibility.
 * @see https://github.com/vpinball/vpinball/blob/master/bumper.cpp */
export class BumperState extends ItemState {
	public ringOffset = 0
	public skirtRotX = 0
	public skirtRotY = 0
	public isCapVisible = true
	public isRingVisible = true
	public isBaseVisible = true
	public isSkirtVisible = true
	public capMaterial?: string
	public ringMaterial?: string
	public baseMaterial?: string
	public skirtMaterial?: string

	public constructor() {
		super()
	}

	public static claim(
		name: string,
		ringOffset: number,
		skirtRotX: number,
		skirtRotY: number,
		isCapVisible: boolean,
		isRingVisible: boolean,
		isBaseVisible: boolean,
		isSkirtVisible: boolean,
		capMaterial: string | undefined,
		ringMaterial: string | undefined,
		baseMaterial: string | undefined,
		skirtMaterial: string | undefined,
	): BumperState {
		const s = new BumperState()
		s.name = name
		s.ringOffset = ringOffset
		s.skirtRotX = skirtRotX
		s.skirtRotY = skirtRotY
		s.isCapVisible = isCapVisible
		s.isRingVisible = isRingVisible
		s.isBaseVisible = isBaseVisible
		s.isSkirtVisible = isSkirtVisible
		s.capMaterial = capMaterial
		s.ringMaterial = ringMaterial
		s.baseMaterial = baseMaterial
		s.skirtMaterial = skirtMaterial
		return s
	}

	public clone(): BumperState {
		return BumperState.claim(
			this.name,
			this.ringOffset,
			this.skirtRotX,
			this.skirtRotY,
			this.isCapVisible,
			this.isRingVisible,
			this.isBaseVisible,
			this.isSkirtVisible,
			this.capMaterial,
			this.ringMaterial,
			this.baseMaterial,
			this.skirtMaterial,
		)
	}

	public diff(state: BumperState): BumperState {
		const d = this.clone()
		omitEqual(d, state, 'ringOffset')
		omitEqual(d, state, 'skirtRotX')
		omitEqual(d, state, 'skirtRotY')
		omitEqual(d, state, 'isCapVisible')
		omitEqual(d, state, 'isRingVisible')
		omitEqual(d, state, 'isBaseVisible')
		omitEqual(d, state, 'isSkirtVisible')
		omitEqual(d, state, 'capMaterial')
		omitEqual(d, state, 'ringMaterial')
		omitEqual(d, state, 'baseMaterial')
		omitEqual(d, state, 'skirtMaterial')
		return d
	}

	public release(): void {}

	public equals(state: BumperState): boolean {
		if (!state) return false
		return (
			state.ringOffset === this.ringOffset &&
			state.skirtRotX === this.skirtRotX &&
			state.skirtRotY === this.skirtRotY &&
			state.isCapVisible === this.isCapVisible &&
			state.isRingVisible === this.isRingVisible &&
			state.isBaseVisible === this.isBaseVisible &&
			state.isSkirtVisible === this.isSkirtVisible &&
			state.capMaterial === this.capMaterial &&
			state.ringMaterial === this.ringMaterial &&
			state.baseMaterial === this.baseMaterial &&
			state.skirtMaterial === this.skirtMaterial
		)
	}
}
