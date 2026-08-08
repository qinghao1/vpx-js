// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Vertex2D } from '../../util/math.js'
import { ItemState } from '../item-state.js'

/** Flipper state — angle and appearance.
 * @see https://github.com/vpinball/vpinball/blob/master/flipper.cpp */
export class FlipperState extends ItemState {
	public angle = 0
	public center!: Vertex2D
	public material?: string
	public texture?: string
	public rubberMaterial?: string

	public static claim(
		name: string,
		angle: number,
		center: Vertex2D,
		isVisible: boolean,
		material: string | undefined,
		texture: string | undefined,
		rubberMaterial: string | undefined,
	): FlipperState {
		const s = new FlipperState()
		s.name = name
		s.angle = angle
		s.center = center
		s.material = material
		s.texture = texture
		s.rubberMaterial = rubberMaterial
		s.isVisible = isVisible
		return s
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
		const d = this.clone()
		if (d.angle === state.angle) delete (d as unknown as Record<string, unknown>).angle
		if (d.center?.equals(state.center)) {
			Vertex2D.release(d.center)
			delete (d as unknown as Record<string, unknown>).center
		}
		if (d.material === state.material) delete (d as unknown as Record<string, unknown>).material
		if (d.texture === state.texture) delete (d as unknown as Record<string, unknown>).texture
		if (d.rubberMaterial === state.rubberMaterial) delete (d as unknown as Record<string, unknown>).rubberMaterial
		if (d.isVisible === state.isVisible) delete (d as unknown as Record<string, unknown>).isVisible
		return d
	}

	public release(): void {
		if (!this.center) this.center = Vertex2D.claim()
	}

	public equals(state: FlipperState): boolean {
		if (!state) return false
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
