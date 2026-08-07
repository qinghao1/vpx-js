// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { HitCircle } from '../../physics/hit-circle.js'
import { degToRad } from '../../util/float.js'
import { Vertex2D } from '../../util/math.js'
import type { SpinnerData } from './spinner-data.js'
import type { SpinnerState } from './spinner-state.js'

/** Spinne hit generator. */
export class SpinnerHitGenerator {
	private readonly data: SpinnerData

	constructor(data: SpinnerData) {
		this.data = data
	}

	public getHitShapes(state: SpinnerState, height: number): HitCircle[] {
		const h = this.data.height + 30.0

		if (this.data.showBracket) {
			/*add a hit shape for the bracket if shown, just in case if the bracket spinner height is low enough so the ball can hit it*/
			const halfLength = this.data.length * 0.5 + this.data.length * 0.1875
			const radAngle = degToRad(this.data.rotation)
			const sn = Math.sin(radAngle)
			const cs = Math.cos(radAngle)

			return [
				new HitCircle(
					new Vertex2D(this.data.center.x + cs * halfLength, this.data.center.y + sn * halfLength),
					this.data.length * 0.075,
					height + this.data.height,
					height + h,
				),
				new HitCircle(
					new Vertex2D(this.data.center.x - cs * halfLength, this.data.center.y - sn * halfLength),
					this.data.length * 0.075,
					height + this.data.height,
					height + h,
				),
			]
		}
		return []
	}
}
