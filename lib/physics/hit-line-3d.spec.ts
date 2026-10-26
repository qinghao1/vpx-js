import { describe, expect, it } from 'vitest'
import { Vertex3D } from '../math/vector.js'
import type { Ball } from '../vpt/ball/ball.js'
import { CollisionEvent } from './collision-event.js'
import { HitLine3D } from './hit-line-3d.js'

describe('HitLine3D', () => {
	function makeBall(x: number, y: number, z: number, vx: number, vy: number, vz: number, radius = 25): Ball {
		return {
			state: { pos: new Vertex3D(x, y, z) },
			hit: { vel: new Vertex3D(vx, vy, vz) },
			data: { radius },
		} as unknown as Ball
	}

	it('hits a vertical line head-on with an in-plane normal', () => {
		const line = new HitLine3D(new Vertex3D(0, 0, 0), new Vertex3D(0, 0, 100))
		const ball = makeBall(50, 0, 50, -10, 0, 0)
		const coll = new CollisionEvent(ball)
		// closing from distance 50 to radius 25 at speed 10
		expect(line.hitTest(ball, 10, coll)).toBeCloseTo(2.5, 9)
		expect(coll.hitNormal.x).toBeCloseTo(1, 9)
		expect(coll.hitNormal.y).toBeCloseTo(0, 9)
		expect(coll.hitNormal.z).toBeCloseTo(0, 9)
		expect(coll.isContact).toBe(false)
		// local-frame transform must be undone
		expect([ball.state.pos.x, ball.state.pos.y, ball.state.pos.z]).toEqual([50, 0, 50])
		expect([ball.hit.vel.x, ball.hit.vel.y, ball.hit.vel.z]).toEqual([-10, 0, 0])
	})

	it('misses a receding ball', () => {
		const line = new HitLine3D(new Vertex3D(0, 0, 0), new Vertex3D(0, 0, 100))
		const ball = makeBall(50, 0, 50, 10, 0, 0)
		expect(line.hitTest(ball, 10, new CollisionEvent(ball))).toBe(-1)
	})

	it('misses outside the z span', () => {
		const line = new HitLine3D(new Vertex3D(0, 0, 0), new Vertex3D(0, 0, 100))
		const ball = makeBall(50, 0, 500, -10, 0, 0)
		expect(line.hitTest(ball, 10, new CollisionEvent(ball))).toBe(-1)
	})

	it('reports a contact at time 0 inside the touch band', () => {
		const line = new HitLine3D(new Vertex3D(0, 0, 0), new Vertex3D(0, 0, 100))
		const ball = makeBall(25.02, 0, 50, 0, 0, 0)
		const coll = new CollisionEvent(ball)
		expect(line.hitTest(ball, 10, coll)).toBe(0)
		expect(coll.isContact).toBe(true)
		expect(coll.hitOrgNormalVelocity).toBe(0)
		expect(coll.hitNormal.x).toBeCloseTo(1, 9)
		expect(coll.hitNormal.y).toBeCloseTo(0, 9)
		expect(coll.hitNormal.z).toBeCloseTo(0, 9)
	})

	it('hits a tilted line with the world-space normal', () => {
		const line = new HitLine3D(new Vertex3D(-50, 0, 0), new Vertex3D(50, 0, 0))
		const ball = makeBall(0, 50, 0, 0, -10, 0)
		const coll = new CollisionEvent(ball)
		expect(line.hitTest(ball, 10, coll)).toBeCloseTo(2.5, 9)
		expect(coll.hitNormal.x).toBeCloseTo(0, 9)
		expect(coll.hitNormal.y).toBeCloseTo(1, 9)
		expect(coll.hitNormal.z).toBeCloseTo(0, 9)
	})
})
