// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Pool } from '../../util/object-pool.js'
import { ItemState } from '../item-state.js'

/** Bumper state.
 *
 * @see https://github.com/vpinball/vpinball/blob/master/bumper.cpp */
export class BumperState extends ItemState {
	public static readonly POOL = new Pool(BumperState)

	/**
	 * Z-offset of the bumper ring
	 */
	public ringOffset: number = 0
	public skirtRotX: number = 0
	public skirtRotY: number = 0

	public isCapVisible: boolean = true
	public isRingVisible: boolean = true
	public isBaseVisible: boolean = true
	public isSkirtVisible: boolean = true
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
		const state = BumperState.POOL.get()
		state.name = name
		state.ringOffset = ringOffset
		state.skirtRotX = skirtRotX
		state.skirtRotY = skirtRotY
		state.isCapVisible = isCapVisible
		state.isRingVisible = isRingVisible
		state.isBaseVisible = isBaseVisible
		state.isSkirtVisible = isSkirtVisible
		state.capMaterial = capMaterial
		state.ringMaterial = ringMaterial
		state.baseMaterial = baseMaterial
		state.skirtMaterial = skirtMaterial
		return state
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
		const diff = this.clone()
		if (diff.ringOffset === state.ringOffset) {
			delete diff.ringOffset
		}
		if (diff.skirtRotX === state.skirtRotX) {
			delete diff.skirtRotX
		}
		if (diff.skirtRotY === state.skirtRotY) {
			delete diff.skirtRotY
		}
		if (diff.isCapVisible === state.isCapVisible) {
			delete diff.isCapVisible
		}
		if (diff.isRingVisible === state.isRingVisible) {
			delete diff.isRingVisible
		}
		if (diff.isBaseVisible === state.isBaseVisible) {
			delete diff.isBaseVisible
		}
		if (diff.isSkirtVisible === state.isSkirtVisible) {
			delete diff.isSkirtVisible
		}
		if (diff.capMaterial === state.capMaterial) {
			delete diff.capMaterial
		}
		if (diff.ringMaterial === state.ringMaterial) {
			delete diff.ringMaterial
		}
		if (diff.baseMaterial === state.baseMaterial) {
			delete diff.baseMaterial
		}
		if (diff.skirtMaterial === state.skirtMaterial) {
			delete diff.skirtMaterial
		}
		return diff
	}

	public release(): void {
		BumperState.POOL.release(this)
	}

	public equals(state: BumperState): boolean {
		/* istanbul ignore if: we don't actually pass empty states. */
		if (!state) {
			return false
		}
		return (
			state.ringOffset === this.ringOffset &&
			state.skirtRotX === this.skirtRotX &&
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
