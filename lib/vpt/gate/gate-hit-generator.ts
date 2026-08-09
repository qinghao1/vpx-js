// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { EventProxy } from '../../game/event-proxy.js'
import { PHYS_SKIN } from '../../physics/constants.js'
import { HitCircle } from '../../physics/hit-circle.js'
import { LineSeg } from '../../physics/line-seg.js'
import type { Vertex2D } from '../../util/vector.js'
import type { GateData } from './gate-data.js'
import { GateHit } from './gate-hit.js'
import type { GateState } from './gate-state.js'

/** Gate hit generator. @see https://github.com/vpinball/vpinball/blob/master/gate.cpp */
export class GateHitGenerator {
	constructor(private readonly data: GateData) {}

	public generateLineSegs(_events: EventProxy, height: number, tangent: Vertex2D): LineSeg[] {
		if (this.data.twoWay) return []
		const halfLength = this.data.length * 0.5
		const angleMin = Math.min(this.data.angleMin, this.data.angleMax)
		const angleMax = Math.max(this.data.angleMin, this.data.angleMax)
		this.data.angleMin = angleMin
		this.data.angleMax = angleMax
		const rgv: Vertex2D[] = [
			this.data.center.clone().addAndRelease(tangent.clone(true).multiplyScalar(halfLength + PHYS_SKIN)),
			this.data.center.clone().subAndRelease(tangent.clone(true).multiplyScalar(halfLength + PHYS_SKIN)),
		]
		const lineSeg = new LineSeg(rgv[0]!, rgv[1]!, height, height + 2 * PHYS_SKIN)
		lineSeg.setElasticity(this.data.elasticity)
		lineSeg.setFriction(this.data.friction)
		return [lineSeg]
	}

	public generateGateHit(state: GateState, events: EventProxy, height: number): GateHit {
		const hit = new GateHit(this.data, state, events, height)
		hit.twoWay = this.data.twoWay
		hit.obj = events
		hit.fe = true
		hit.isEnabled = this.data.isCollidable
		return hit
	}

	public generateBracketHits(_state: GateState, _events: EventProxy, height: number, tangent: Vertex2D): HitCircle[] {
		if (!this.data.showBracket) return []
		const halfLength = this.data.length * 0.5
		return [
			new HitCircle(
				this.data.center.clone().addAndRelease(tangent.clone(true).multiplyScalar(halfLength)),
				0.01,
				height,
				height + this.data.height,
			),
			new HitCircle(
				this.data.center.clone().subAndRelease(tangent.clone(true).multiplyScalar(halfLength)),
				0.01,
				height,
				height + this.data.height,
			),
		]
	}
}
