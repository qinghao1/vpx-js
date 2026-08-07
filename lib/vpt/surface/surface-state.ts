// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Pool } from '../../util/object-pool.js'
import { ItemState } from '../item-state.js'

/** Surface state.
 *
 * @see https://github.com/vpinball/vpinball/blob/master/surface.cpp */
export class SurfaceState extends ItemState {
	public static readonly POOL = new Pool(SurfaceState)

	public isDropped: boolean = false

	public isTopVisible: boolean = true
	public topMaterial?: string
	public topTexture?: string

	public isSideVisible: boolean = true
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
		const state = SurfaceState.POOL.get()
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
		if (diff.isDropped === state.isDropped) {
			delete diff.isDropped
		}
		if (diff.isTopVisible === state.isTopVisible) {
			delete diff.isTopVisible
		}
		if (diff.topMaterial === state.topMaterial) {
			delete diff.topMaterial
		}
		if (diff.topTexture === state.topTexture) {
			delete diff.topTexture
		}
		if (diff.isSideVisible === state.isSideVisible) {
			delete diff.isSideVisible
		}
		if (diff.sideMaterial === state.sideMaterial) {
			delete diff.sideMaterial
		}
		if (diff.sideTexture === state.sideTexture) {
			delete diff.sideTexture
		}
		return diff
	}

	public release(): void {
		SurfaceState.POOL.release(this)
	}

	public equals(state: SurfaceState): boolean {
		/* istanbul ignore if: we don't actually pass empty states. */
		if (!state) {
			return false
		}
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
