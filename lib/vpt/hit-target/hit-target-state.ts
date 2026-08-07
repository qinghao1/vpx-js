// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Pool } from '../../util/object-pool.js'
import { ItemState } from '../item-state.js'

/** Hit target state — drop offset, rotation and appearance.
 * @see https://github.com/vpinball/vpinball/blob/master/hittarget.cpp */
export class HitTargetState extends ItemState {
	public static readonly POOL = new Pool(HitTargetState)

	public zOffset = 0
	public xRotation = 0
	public material?: string
	public texture?: string

	public constructor() {
		super()
	}

	public static claim(
		name: string,
		zOffset: number,
		xRotation: number,
		material: string | undefined,
		texture: string | undefined,
		isVisible: boolean,
	): HitTargetState {
		const s = HitTargetState.POOL.get()
		s.name = name
		s.zOffset = zOffset
		s.xRotation = xRotation
		s.material = material
		s.texture = texture
		s.isVisible = isVisible
		return s
	}

	public clone(): HitTargetState {
		return HitTargetState.claim(this.name, this.zOffset, this.xRotation, this.material, this.texture, this.isVisible)
	}

	public diff(state: HitTargetState): HitTargetState {
		const d = this.clone()
		if (d.zOffset === state.zOffset) delete (d as unknown as Record<string, unknown>).zOffset
		if (d.xRotation === state.xRotation) delete (d as unknown as Record<string, unknown>).xRotation
		if (d.material === state.material) delete (d as unknown as Record<string, unknown>).material
		if (d.texture === state.texture) delete (d as unknown as Record<string, unknown>).texture
		if (d.isVisible === state.isVisible) delete (d as unknown as Record<string, unknown>).isVisible
		return d
	}

	public release(): void {
		HitTargetState.POOL.release(this)
	}

	public equals(state: HitTargetState): boolean {
		if (!state) return false
		return (
			state.zOffset === this.zOffset &&
			state.xRotation === this.xRotation &&
			state.material === this.material &&
			state.texture === this.texture &&
			state.isVisible === this.isVisible
		)
	}
}
