import { describe, expect, it } from 'vitest'
import { Vertex3D } from '../math/vector.js'
import type { Ball } from '../vpt/ball/ball.js'
import { CollisionEvent } from './collision-event.js'
import { HitTriangle } from './hit-triangle.js'

describe('HitTriangle', () => {
	it('marks thin triangles degenerate like upstream (LengthSquared < 0.01)', () => {
		// Cross product (0, 0, 0.05): LengthSquared 0.0025 < 0.01, so upstream zeroes the normal.
		const thin = new HitTriangle([new Vertex3D(0, 0, 0), new Vertex3D(0, 0.05, 0), new Vertex3D(1, 0, 0)])
		expect(thin.isDegenerate()).toBe(true)
	})

	it('keeps healthy triangles non-degenerate', () => {
		const healthy = new HitTriangle([new Vertex3D(0, 0, 0), new Vertex3D(0, 1, 0), new Vertex3D(1, 0, 0)])
		expect(healthy.isDegenerate()).toBe(false)
		expect(healthy.normal.length()).toBeCloseTo(1, 10)
	})

	it('marks exactly-collapsed triangles degenerate', () => {
		const flat = new HitTriangle([new Vertex3D(0, 0, 0), new Vertex3D(1, 0, 0), new Vertex3D(2, 0, 0)])
		expect(flat.isDegenerate()).toBe(true)
	})

	function triBall(x: number, y: number, z: number, vx: number, vy: number, vz: number): Ball {
		return {
			state: { pos: new Vertex3D(x, y, z) },
			hit: { vel: new Vertex3D(vx, vy, vz) },
			data: { radius: 25 },
		} as unknown as Ball
	}

	// Winding (0,0,0),(0,1,0),(1,0,0) yields a +z normal.
	function unitTri(): HitTriangle {
		return new HitTriangle([new Vertex3D(0, 0, 0), new Vertex3D(0, 1, 0), new Vertex3D(1, 0, 0)])
	}

	it('hits inside the triangle with the face normal (barycentric u+v<=1)', () => {
		const tri = unitTri()
		const ball = triBall(0.25, 0.25, 50, 0, 0, -10)
		const coll = new CollisionEvent(ball)
		// Ball surface starts 25 above the face, closing at 10/s.
		expect(tri.hitTest(ball, 10, coll)).toBeCloseTo(2.5, 9)
		expect([coll.hitNormal.x, coll.hitNormal.y, coll.hitNormal.z]).toEqual([0, 0, 1])
		expect(coll.hitDistance).toBeCloseTo(25, 9)
		expect(coll.isContact).toBe(false)
	})

	it('misses a ball aimed outside the triangle (barycentric u+v>1)', () => {
		const tri = unitTri()
		const ball = triBall(2, 2, 50, 0, 0, -10)
		expect(tri.hitTest(ball, 10, new CollisionEvent(ball))).toBe(-1)
	})

	it('misses a ball approaching the back face', () => {
		const tri = unitTri()
		const ball = triBall(0.25, 0.25, -50, 0, 0, 10)
		expect(tri.hitTest(ball, 10, new CollisionEvent(ball))).toBe(-1)
	})
})
