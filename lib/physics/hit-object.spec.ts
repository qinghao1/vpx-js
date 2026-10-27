import { describe, expect, it } from 'vitest'
import type { EventProxy } from '../game/event-proxy.js'
import type { PlayerPhysics } from '../game/player-physics.js'
import { Vertex3D } from '../math/vector.js'
import type { Ball } from '../vpt/ball/ball.js'
import type { CollisionEvent } from './collision-event.js'
import { CollisionType } from './collision-type.js'
import { HitObject } from './hit-object.js'

class TestHit extends HitObject {
	public override calcHitBBox(): void {}
	public override hitTest(_ball: Ball, _dTime: number, _coll: CollisionEvent, _physics: PlayerPhysics): number {
		return -1
	}
	public override collide(_coll: CollisionEvent, _physics: PlayerPhysics): void {}
}

function makeBall(x: number): Ball {
	return {
		hit: { eventPos: new Vertex3D(-1, -1, -1), lastEventSqrDist: 0 },
		state: { pos: new Vertex3D(x, 0, 0) },
	} as unknown as Ball
}

function makeTarget(counter: { count: number }): TestHit {
	const target = new TestHit()
	target.obj = {
		fireGroupEvent: () => {
			counter.count++
		},
	} as unknown as EventProxy
	target.fe = true
	return target
}

describe('HitObject.fireHitEvent', () => {
	it('keeps the anchor on suppressed hits so slow drift re-fires (upstream collide.cpp)', () => {
		const counter = { count: 0 }
		const target = makeTarget(counter)
		const ball = makeBall(0)
		target.fireHitEvent(ball)
		expect(counter.count).toBe(1)
		for (let step = 1; step <= 10; step++) {
			ball.state.pos.set(0.1 * step, 0, 0)
			target.fireHitEvent(ball)
		}
		expect(counter.count).toBe(2)
		expect(ball.hit.eventPos.x).toBeCloseTo(0.6, 10)
	})

	it('still suppresses repeat hits at the same place', () => {
		const counter = { count: 0 }
		const target = makeTarget(counter)
		const ball = makeBall(0)
		target.fireHitEvent(ball)
		target.fireHitEvent(ball)
		expect(counter.count).toBe(1)
		expect(ball.hit.eventPos.x).toBe(0)
	})

	it('fires HitTarget hits on any movement (zero-distance exemption)', () => {
		const hitCounter = { count: 0 }
		const target = makeTarget(hitCounter)
		target.objType = CollisionType.HitTarget
		const ball = makeBall(0)
		target.fireHitEvent(ball)
		expect(hitCounter.count).toBe(1)
		// Drift 0.1 (distSq 0.01): fires for HitTarget, suppressed for ordinary hits.
		ball.state.pos.set(0.1, 0, 0)
		target.fireHitEvent(ball)
		expect(hitCounter.count).toBe(2)

		const plainCounter = { count: 0 }
		const plain = makeTarget(plainCounter)
		const plainBall = makeBall(0)
		plain.fireHitEvent(plainBall)
		plainBall.state.pos.set(0.1, 0, 0)
		plain.fireHitEvent(plainBall)
		expect(plainCounter.count).toBe(1)
	})

	it('fires after real travel even at the same place (upstream m_lastEventSqrDist)', () => {
		const counter = { count: 0 }
		const target = makeTarget(counter)
		const ball = makeBall(0)
		target.fireHitEvent(ball)
		expect(counter.count).toBe(1)
		// Ball travelled (accumulated by BallMover) and came back: the
		// same-place filter is bypassed and the accumulator resets.
		ball.hit.lastEventSqrDist = 0.6
		target.fireHitEvent(ball)
		expect(counter.count).toBe(2)
		expect(ball.hit.lastEventSqrDist).toBe(0)
	})

	it('does not fire when disabled', () => {
		const counter = { count: 0 }
		const target = makeTarget(counter)
		target.isEnabled = false
		const ball = makeBall(0)
		target.fireHitEvent(ball)
		expect(counter.count).toBe(0)
		expect(ball.hit.eventPos.x).toBe(-1)
	})
})
