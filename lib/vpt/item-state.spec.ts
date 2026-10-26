// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import { Matrix2D } from '../math/matrix.js'
import { Vertex2D, Vertex3D } from '../math/vector.js'
import { BallState } from './ball/ball-state.js'
import { FlipperState } from './flipper/flipper-state.js'

describe('The VPinball item state', () => {
	it('should deep-copy pooled members on clone', () => {
		const ball = BallState.claim('ball', new Vertex3D(1, 2, 3))
		const copy = ball.clone()
		expect(copy.pos).to.not.equal(ball.pos)
		expect(copy.orientation).to.not.equal(ball.orientation)
		expect(copy.pos.equals(ball.pos)).to.equal(true)
		copy.pos.set(new Vertex3D(9, 9, 9))
		expect(ball.pos.x).to.equal(1)
	})

	it('should compare pooled members by value', () => {
		const flipper = FlipperState.claim('flipper', 0, new Vertex2D(1, 2), true, undefined, undefined, undefined)
		const same = FlipperState.claim('flipper', 0, new Vertex2D(1, 2), true, undefined, undefined, undefined)
		expect(flipper.equals(same)).to.equal(true)
		same.center.set(3, 4)
		expect(flipper.equals(same)).to.equal(false)
		expect(flipper.equals(undefined as unknown as FlipperState)).to.equal(false)
	})

	it('should omit equal members from diffs and keep the name', () => {
		const ball = BallState.claim('ball', new Vertex3D(1, 2, 3))
		const prev = ball.clone()
		ball.pos.set(new Vertex3D(4, 5, 6))
		const diff = ball.diff(prev)
		expect(diff.name).to.equal('ball')
		expect(Object.hasOwn(diff, 'pos')).to.equal(true)
		expect(Object.hasOwn(diff, 'orientation')).to.equal(false)
		expect(Object.hasOwn(diff, 'isFrozen')).to.equal(false)
	})

	it('should deep-copy pooled members on copyFrom', () => {
		const next = FlipperState.claim('flipper', 1, new Vertex2D(5, 6), true, 'mat', undefined, undefined)
		const prev = FlipperState.claim('flipper', 0, new Vertex2D(1, 2), true, undefined, undefined, undefined)
		const center = prev.center
		prev.copyFrom(next)
		expect(prev.center).to.equal(center)
		expect(prev.center.x).to.equal(5)
		expect(prev.center).to.not.equal(next.center)
		expect(prev.equals(next)).to.equal(true)
	})

	it('should not alias diff members on mergeFrom', () => {
		const current = BallState.claim('ball', new Vertex3D(1, 2, 3))
		const prev = current.clone()
		current.pos.set(new Vertex3D(4, 5, 6))
		const diff = current.diff(prev)
		const target = BallState.claim('ball', new Vertex3D(0, 0, 0))
		target.mergeFrom(diff)
		expect(target.pos).to.not.equal(diff.pos)
		expect(target.pos.x).to.equal(4)
		expect(target.orientation.equals(current.orientation)).to.equal(true)
		diff.release()
		expect(target.pos.x).to.equal(4)
	})

	it('should return pooled members to their pools on release', () => {
		const balls = [
			BallState.claim('a', new Vertex3D(1, 0, 0)),
			BallState.claim('b', new Vertex3D(2, 0, 0)),
			BallState.claim('c', new Vertex3D(3, 0, 0)),
		]
		const positions = balls.map(ball => ball.pos)
		const orientations = balls.map(ball => ball.orientation)
		for (const ball of balls) ball.release()
		const reclaimedPositions = [Vertex3D.claim(), Vertex3D.claim(), Vertex3D.claim()]
		const reclaimedOrientations = [Matrix2D.claim(), Matrix2D.claim(), Matrix2D.claim()]
		expect(reclaimedPositions).to.have.members(positions)
		expect(reclaimedOrientations).to.have.members(orientations)
	})
})
