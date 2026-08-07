// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Pool } from '../../util/object-pool.js'
import { ItemState } from '../item-state.js'

/** Bumper state — ring offset, skirt rotation and material visibility.
 * @see https://github.com/vpinball/vpinball/blob/master/bumper.cpp */
export class BumperState extends ItemState {
	public static readonly POOL = new Pool(BumperState)

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
		const s = BumperState.POOL.get()
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
		if (d.ringOffset === state.ringOffset) delete (d as unknown as Record<string, unknown>).ringOffset
		if (d.skirtRotX === state.skirtRotX) delete (d as unknown as Record<string, unknown>).skirtRotX
		if (d.skirtRotY === state.skirtRotY) delete (d as unknown as Record<string, unknown>).skirtRotY
		if (d.isCapVisible === state.isCapVisible) delete (d as unknown as Record<string, unknown>).isCapVisible
		if (d.isRingVisible === state.isRingVisible) delete (d as unknown as Record<string, unknown>).isRingVisible
		if (d.isBaseVisible === state.isBaseVisible) delete (d as unknown as Record<string, unknown>).isBaseVisible
		if (d.isSkirtVisible === state.isSkirtVisible) delete (d as unknown as Record<string, unknown>).isSkirtVisible
		if (d.capMaterial === state.capMaterial) delete (d as unknown as Record<string, unknown>).capMaterial
		if (d.ringMaterial === state.ringMaterial) delete (d as unknown as Record<string, unknown>).ringMaterial
		if (d.baseMaterial === state.baseMaterial) delete (d as unknown as Record<string, unknown>).baseMaterial
		if (d.skirtMaterial === state.skirtMaterial) delete (d as unknown as Record<string, unknown>).skirtMaterial
		return d
	}

	public release(): void {
		BumperState.POOL.release(this)
	}

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
