// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Vertex2D } from '../../math/vector.js'
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
}
