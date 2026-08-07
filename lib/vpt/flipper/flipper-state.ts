// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Vertex2D } from '../../math/vertex2d.js'
import { Pool } from '../../util/object-pool.js'
import { ItemState } from '../item-state.js'

/** Flipper state. */
export class FlipperState extends ItemState {
	public static readonly POOL = new Pool(FlipperState)

	/**
	 * Angle in rad
	 */
	public angle: number = 0
	public center!: Vertex2D
	public material?: string
	public texture?: string
	public rubberMaterial?: string

	public constructor() {
		super()
	}

	public static claim(
		name: string,
		angle: number,
		center: Vertex2D,
		isVisible: boolean,
		material: string | undefined,
		texture: string | undefined,
		rubberMaterial: string | undefined,
	): FlipperState {
		const state = FlipperState.POOL.get()
		state.name = name
		state.angle = angle
		state.center = center
		state.material = material
		state.texture = texture
		state.rubberMaterial = rubberMaterial
		state.isVisible = isVisible
		return state
	}

	public clone(): FlipperState {
		return FlipperState.claim(
			this.name,
			this.angle,
			this.center.clone(true),
			this.isVisible,
			this.material,
			this.texture,
			this.rubberMaterial,
		)
	}

	public diff(state: FlipperState): FlipperState {
		const diff = this.clone()
		if (diff.angle === state.angle) {
			delete diff.angle
		}
		if (diff.center && diff.center.equals(state.center)) {
			Vertex2D.release(diff.center)
			delete diff.center
		}
		if (diff.material === state.material) {
			delete diff.material
		}
		if (diff.texture === state.texture) {
			delete diff.texture
		}
		if (diff.rubberMaterial === state.rubberMaterial) {
			delete diff.rubberMaterial
		}
		if (diff.isVisible === state.isVisible) {
			delete diff.isVisible
		}
		return diff
	}

	public release(): void {
		if (!this.center) {
			this.center = Vertex2D.claim()
		}
		FlipperState.POOL.release(this)
	}

	public equals(state: FlipperState): boolean {
		/* istanbul ignore if: we don't actually pass empty states. */
		if (!state) {
			return false
		}
		return (
			state.angle === this.angle &&
			state.center.equals(this.center) &&
			state.material === this.material &&
			state.texture === this.texture &&
			state.rubberMaterial === this.rubberMaterial &&
			state.isVisible === this.isVisible
		)
	}
}
