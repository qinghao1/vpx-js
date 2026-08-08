// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { PlayerPhysics } from '../../game/player-physics.js'
import { PHYS_FACTOR } from '../../physics/constants.js'
import type { MoverObject } from '../../physics/mover-object.js'
import { Matrix2D, Vertex3D } from '../../util/math.js'
import type { BallData } from './ball-data.js'
import type { BallHit } from './ball-hit.js'
import type { BallState } from './ball-state.js'

/** Moves a ball each tick — integrates position, orientation, and velocity. */
export class BallMover implements MoverObject {
	constructor(
		private readonly id: number,
		private readonly data: BallData,
		private readonly state: BallState,
		private readonly hit: BallHit,
	) {}

	public updateDisplacements(dtime: number): void {
		if (this.state.isFrozen) return
		this.state.pos.addAndRelease(this.hit.vel.clone(true).multiplyScalar(dtime))
		this.hit.calcHitBBox()

		if (this.hit.angularVelocity.lengthSq() >= 1e-12) {
			const skew = Matrix2D.claim().createSkewSymmetric(this.hit.angularVelocity)
			const delta = Matrix2D.claim()
			delta.multiplyMatrix(skew, this.state.orientation)
			delta.multiplyScalar(dtime)
			this.state.orientation.addMatrix(delta, this.state.orientation)
			this.state.orientation.orthoNormalize()
			Matrix2D.release(skew, delta)
		}
		this.hit.angularVelocity.setAndRelease(this.hit.angularMomentum.clone(true).divideScalar(this.hit.inertia))
	}

	public updateVelocities(physics: PlayerPhysics): void {
		if (!this.state.isFrozen) {
			if (physics.ballControl && this.id === physics.activeBallBC!.id && physics.bcTarget) {
				this.hit.vel.x *= 0.5
				this.hit.vel.y *= 0.5
				const clamp = (v: number) => Math.max(-10, Math.min(10, v / 10))
				this.hit.vel.addAndRelease(
					Vertex3D.claim(
						clamp(physics.bcTarget.x - this.state.pos.x),
						clamp(physics.bcTarget.y - this.state.pos.y),
						-2,
					),
				)
			} else {
				this.hit.vel.addAndRelease(physics.gravity.clone(true).multiplyScalar(PHYS_FACTOR))
			}
		}
		this.hit.calcHitBBox()
	}
}
