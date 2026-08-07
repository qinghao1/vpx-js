// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Matrix2D, Vertex3D } from '../../util/math.js'
import { Pool } from '../../util/object-pool.js'
import { ItemState } from '../item-state.js'

/** Dynamic ball state — position, orientation, frozen flag. */
export class BallState extends ItemState {
	public static readonly POOL = new Pool(BallState)

	public pos: Vertex3D = Vertex3D.claim()
	public orientation = Matrix2D.claim()
	public isFrozen = false

	public constructor() {
		super()
	}

	public static claim(name: string, pos: Vertex3D): BallState {
		const s = BallState.POOL.get()
		s.name = name
		s.pos.set(pos)
		s.isFrozen = false
		return s
	}

	public clone(): BallState {
		const s = BallState.claim(this.name, this.pos)
		s.orientation.set(this.orientation)
		return s
	}

	public diff(state: BallState): BallState {
		const d = this.clone()
		if (d.pos.equals(state.pos)) {
			Vertex3D.release(d.pos)
			delete (d as unknown as Record<string, unknown>).pos
		}
		if (d.orientation.equals(state.orientation)) {
			Matrix2D.release(d.orientation)
			delete (d as unknown as Record<string, unknown>).orientation
		}
		if (d.isFrozen === state.isFrozen) delete (d as unknown as Record<string, unknown>).isFrozen
		return d
	}

	public release(): void {
		if (!this.pos) this.pos = Vertex3D.claim()
		if (!this.orientation) this.orientation = Matrix2D.claim()
		else this.orientation.setIdentity()
		BallState.POOL.release(this)
	}

	public equals(state: BallState): boolean {
		if (!state) return false
		return this.pos.equals(state.pos) && this.orientation.equals(state.orientation) && this.isFrozen === state.isFrozen
	}
}
