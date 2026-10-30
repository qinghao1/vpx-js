// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { MathUtils } from 'three'
import { Vertex2D } from '../../math/vector.js'
import { HitCircle } from '../../physics/hit-circle.js'
import type { SpinnerData } from './spinner-data.js'

/** @see https://github.com/vpinball/vpinball/blob/master/spinner.cpp */
export class SpinnerHitGenerator {
	constructor(private readonly data: SpinnerData) {}

	public getHitShapes(height: number): HitCircle[] {
		if (!this.data.showBracket) return []
		const h = this.data.height + 30
		const halfLength = this.data.length * 0.5 + this.data.length * 0.1875
		const radAngle = MathUtils.degToRad(this.data.rotation)
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
}
