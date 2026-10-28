// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { describe, expect, it } from 'vitest'
import { TableBuilder } from '../../../test/table-builder.js'
import { Vertex3D } from '../../math/vector.js'
import type { Ball } from '../../vpt/ball/ball.js'
import { Player } from '../player.js'
import { BALL_FROZEN, BALL_ID, BALL_POS, BALL_RADIUS, BALL_STRIDE, BALL_VEL, MAX_BALLS } from './physics-buffer.js'
import { isFreshSyncAck, LOST_SYNC_FRAMES, mirrorWorkerFrame, shouldResyncMirror } from './worker-mirror.js'

function makePlayer(ballCount: number): { player: Player; balls: Ball[] } {
	const player = new Player(new TableBuilder().build()).init()
	const balls: Ball[] = []
	for (let i = 0; i < ballCount; i++) {
		balls.push(
			player.createBall(
				{
					getBallCreationPosition: () => new Vertex3D(100 * i, 100 * i, 100),
					getBallCreationVelocity: () => new Vertex3D(0, 0, 0),
					onBallCreated: () => {},
				},
				25,
			),
		)
	}
	return { player, balls }
}

function place(ball: Ball, pos: [number, number, number], vel: [number, number, number], frozen = false): void {
	ball.state.pos.set(pos[0], pos[1], pos[2])
	ball.hit.vel.set(vel[0], vel[1], vel[2])
	ball.state.isFrozen = frozen
}

function slot(
	scratch: Float32Array,
	index: number,
	id: number,
	pos: [number, number, number],
	vel: [number, number, number],
	frozen = false,
): void {
	const off = index * BALL_STRIDE
	scratch[off + BALL_POS] = pos[0]
	scratch[off + BALL_POS + 1] = pos[1]
	scratch[off + BALL_POS + 2] = pos[2]
	scratch[off + BALL_VEL] = vel[0]
	scratch[off + BALL_VEL + 1] = vel[1]
	scratch[off + BALL_VEL + 2] = vel[2]
	scratch[off + BALL_RADIUS] = 25
	scratch[off + BALL_ID] = id
	scratch[off + BALL_FROZEN] = frozen ? 1 : 0
}

const freshScratch = (): Float32Array => new Float32Array(MAX_BALLS * BALL_STRIDE)

describe('worker mirror', () => {
	it('copies drift-ok matched balls by id, never by slot index', () => {
		const { balls } = makePlayer(2)
		const [first, second] = balls as [Ball, Ball]
		place(first, [100, 200, 300], [1, 0, 0])
		place(second, [400, 500, 600], [0, 2, 0])
		const scratch = freshScratch()
		// Swapped slots: each ball must pick up its own id's frame, not its index.
		slot(scratch, 0, second.id, [401, 501, 601], [0, 2.1, 0])
		slot(scratch, 1, first.id, [100.5, 200, 300], [1, 0, 0])
		const res = mirrorWorkerFrame(balls, scratch, 2)
		expect(res.miss).toBe(false)
		expect(res.teleports).toEqual([])
		expect(first.state.pos.x).toBeCloseTo(100.5)
		expect(second.state.pos.x).toBeCloseTo(401)
		expect(second.hit.vel.y).toBeCloseTo(2.1)
		expect(res.skip.size).toBe(2)
		expect(res.skip.has(first.getMover())).toBe(true)
		expect(res.skip.has(second.getMover())).toBe(true)
	})

	it('mirrors matched ids across a same-count shift, skips the newborn, zero teleports', () => {
		const { player, balls } = makePlayer(2)
		const [retired, survivor] = balls as [Ball, Ball]
		player.destroyBall(retired)
		const newborn = player.createBall(
			{
				getBallCreationPosition: () => new Vertex3D(700, 800, 900),
				getBallCreationVelocity: () => new Vertex3D(0, 0, 0),
				onBallCreated: () => {},
			},
			25,
		)
		place(survivor, [400, 500, 600], [0, 0, 0])
		place(newborn, [700, 800, 900], [0, 0, 0])
		const main = player.balls
		expect(main.map(ball => ball.id).sort((a, b) => a - b)).toEqual([survivor.id, newborn.id].sort((a, b) => a - b))
		const scratch = freshScratch()
		// Worker still holds the retired id in slot 0 (stale) and the survivor in slot 1.
		slot(scratch, 0, retired.id, [1, 2, 3], [0, 0, 0])
		slot(scratch, 1, survivor.id, [400.5, 500, 600], [0, 0, 0])
		const res = mirrorWorkerFrame(main, scratch, 2)
		// Stale slot skipped, survivor mirrored, newborn keeps local sim.
		expect(res.miss).toBe(true)
		expect(res.teleports).toEqual([])
		expect(survivor.state.pos.x).toBeCloseTo(400.5)
		expect(newborn.state.pos.x).toBe(700)
		expect(res.skip.has(survivor.getMover())).toBe(true)
		expect(res.skip.has(newborn.getMover())).toBe(false)
		expect(res.skip.size).toBe(1)
	})

	it('teleports drift-bad matched balls by id and leaves main state in place', () => {
		const { balls } = makePlayer(1)
		const [ball] = balls as [Ball]
		place(ball, [100, 200, 300], [1, 2, 3])
		const scratch = freshScratch()
		slot(scratch, 0, ball.id, [500, 500, 500], [9, 9, 9])
		const res = mirrorWorkerFrame(balls, scratch, 1)
		expect(res.miss).toBe(false)
		expect(res.teleports).toEqual([{ id: ball.id, pos: [100, 200, 300], vel: [1, 2, 3], frozen: false }])
		// No copy on the drift path: main stays authoritative until the worker converges.
		expect(ball.state.pos.x).toBe(100)
		expect(ball.hit.vel.x).toBe(1)
	})

	it('teleports frozen-only mismatches even within drift budget', () => {
		const { balls } = makePlayer(1)
		const [ball] = balls as [Ball]
		place(ball, [100, 200, 300], [0, 0, 0], true)
		const scratch = freshScratch()
		slot(scratch, 0, ball.id, [100, 200, 300], [0, 0, 0], false)
		const res = mirrorWorkerFrame(balls, scratch, 1)
		expect(res.teleports).toEqual([{ id: ball.id, pos: [100, 200, 300], vel: [0, 0, 0], frozen: true }])
		expect(ball.state.isFrozen).toBe(true)
	})

	it('still mirrors matched balls on count mismatch', () => {
		const { balls } = makePlayer(2)
		const [first, second] = balls as [Ball, Ball]
		place(first, [100, 200, 300], [0, 0, 0])
		place(second, [400, 500, 600], [0, 0, 0])
		const scratch = freshScratch()
		slot(scratch, 0, second.id, [400.5, 500, 600], [0, 0, 0])
		const res = mirrorWorkerFrame(balls, scratch, 1)
		expect(res.miss).toBe(true)
		expect(res.teleports).toEqual([])
		expect(second.state.pos.x).toBeCloseTo(400.5)
		expect(first.state.pos.x).toBe(100)
	})
})

describe('mirror resync gate', () => {
	it('resyncs only on a streak with no in-flight sync and a minimum gap', () => {
		expect(shouldResyncMirror(2, null, 5)).toBe(true)
		expect(shouldResyncMirror(9, null, 100)).toBe(true)
		expect(shouldResyncMirror(1, null, 100)).toBe(false)
		expect(shouldResyncMirror(0, null, 100)).toBe(false)
		expect(shouldResyncMirror(5, 3, 100)).toBe(false)
		expect(shouldResyncMirror(5, null, 4)).toBe(false)
		// Loose `== null`: an uninitialized slot counts as no in-flight sync.
		expect(shouldResyncMirror(5, undefined, 100)).toBe(true)
	})

	it('accepts the fresh ack and ignores stale ones', () => {
		expect(isFreshSyncAck(7, 7)).toBe(true)
		expect(isFreshSyncAck(7, 6)).toBe(false)
		expect(isFreshSyncAck(7, 8)).toBe(false)
		expect(isFreshSyncAck(null, 7)).toBe(false)
		expect(isFreshSyncAck(undefined, 7)).toBe(false)
	})

	it('emits at most 12 syncs over 60 mismatching frames with a responsive worker', () => {
		const { balls } = makePlayer(1)
		const scratch = freshScratch()
		slot(scratch, 0, -1, [0, 0, 0], [0, 0, 0])
		let epoch = 0
		let inflight: number | null = null
		let workerAck = 0
		let framesSinceSync = 100
		let streak = 0
		let syncs = 0
		for (let frame = 0; frame < 60; frame++) {
			framesSinceSync++
			const res = mirrorWorkerFrame(balls, scratch, 1)
			expect(res.miss).toBe(true)
			streak = res.miss ? streak + 1 : 0
			if (shouldResyncMirror(streak, inflight, framesSinceSync)) {
				syncs++
				inflight = ++epoch
				framesSinceSync = 0
				// Responsive worker: the `synced` ack for this epoch lands
				// before the next frame.
				workerAck = inflight
			}
			if (isFreshSyncAck(inflight, workerAck)) inflight = null
		}
		expect(syncs).toBeGreaterThan(0)
		expect(syncs).toBeLessThanOrEqual(12)
	})

	it('backs off to the lost-ack timeout when the worker goes quiet', () => {
		const { balls } = makePlayer(1)
		const scratch = freshScratch()
		slot(scratch, 0, -1, [0, 0, 0], [0, 0, 0])
		let epoch = 0
		let inflight: number | null = null
		let framesSinceSync = 100
		let streak = 0
		let syncs = 0
		for (let frame = 0; frame < 60; frame++) {
			framesSinceSync++
			if (inflight !== null && framesSinceSync >= LOST_SYNC_FRAMES) inflight = null
			const res = mirrorWorkerFrame(balls, scratch, 1)
			streak = res.miss ? streak + 1 : 0
			if (shouldResyncMirror(streak, inflight, framesSinceSync)) {
				syncs++
				inflight = ++epoch
				framesSinceSync = 0
			}
			// No ack ever arrives: the in-flight gate holds until the timeout.
		}
		expect(syncs).toBe(2)
	})
})
