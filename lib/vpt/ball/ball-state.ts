// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Matrix2D } from '../../math/matrix.js'
import { Vertex3D } from '../../math/vector.js'
import { ItemState } from '../item-state.js'

/** Ball state — pos/orientation/frozen. @see https://github.com/vpinball/vpinball/blob/master/ball.cpp */
export class BallState extends ItemState {
	public pos: Vertex3D = Vertex3D.claim()
	public orientation = Matrix2D.claim()
	public isFrozen = false

	public static claim(name: string, pos: Vertex3D): BallState {
		const s = new BallState()
		s.name = name
		s.pos.set(pos)
		s.isFrozen = false
		return s
	}
}
