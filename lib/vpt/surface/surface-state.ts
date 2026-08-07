// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { ItemState } from '../item-state.js'
import { omitEqual } from '../state-helpers.js'

/** Surface state. @see https://github.com/vpinball/vpinball/blob/master/surface.cpp */
export class SurfaceState extends ItemState {
	public isDropped = false

	public isTopVisible = true
	public topMaterial?: string
	public topTexture?: string

	public isSideVisible = true
	public sideMaterial?: string
	public sideTexture?: string

	// @ts-expect-error
	get isVisible(): boolean {
		return this.isTopVisible || this.isSideVisible
	}
	/** Set isVisible. */
	set isVisible(v) {
		/* not used in abstract */
	}

	public constructor() {
		super()
	}

	public static claim(
		name: string,
		isDropped: boolean,
		isTopVisible: boolean,
		topMaterial: string | undefined,
		topTexture: string | undefined,
		isSideVisible: boolean,
		sideMaterial: string | undefined,
		sideTexture: string | undefined,
	): SurfaceState {
		const state = new SurfaceState()
		state.name = name
		state.isDropped = isDropped
		state.isTopVisible = isTopVisible
		state.topMaterial = topMaterial
		state.topTexture = topTexture
		state.isSideVisible = isSideVisible
		state.sideMaterial = sideMaterial
		state.sideTexture = sideTexture
		return state
	}

	public clone(): SurfaceState {
		return SurfaceState.claim(
			this.name,
			this.isDropped,
			this.isTopVisible,
			this.topMaterial,
			this.topTexture,
			this.isSideVisible,
			this.sideMaterial,
			this.sideTexture,
		)
	}

	public diff(state: SurfaceState): SurfaceState {
		const diff = this.clone()
		omitEqual(diff, state, 'isDropped')
		omitEqual(diff, state, 'isTopVisible')
		omitEqual(diff, state, 'topMaterial')
		omitEqual(diff, state, 'topTexture')
		omitEqual(diff, state, 'isSideVisible')
		omitEqual(diff, state, 'sideMaterial')
		omitEqual(diff, state, 'sideTexture')
		return diff
	}

	public release(): void {}

	public equals(state: SurfaceState): boolean {
		if (!state) return false
		return (
			state.isDropped === this.isDropped &&
			state.isTopVisible === this.isTopVisible &&
			state.topMaterial === this.topMaterial &&
			state.topTexture === this.topTexture &&
			state.isSideVisible === this.isSideVisible &&
			state.sideMaterial === this.sideMaterial &&
			state.sideTexture === this.sideTexture
		)
	}
}
