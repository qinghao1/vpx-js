// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { MoverObject } from '../../physics/mover-object.js'
import type { Ball } from '../../vpt/ball/ball.js'
import { BALL_FROZEN, BALL_ID, BALL_POS, BALL_STRIDE, BALL_VEL } from './physics-buffer.js'

/** Worker/main drift budgets per frame (VPX units, units/ms): below these the main
 * thread mirrors worker balls; above them a script-side discrete (kick, capture,
 * teleport) is forwarded to the worker instead. Tight on purpose: the mirror
 * re-syncs every frame, so residuals stay far below while script edits stand out. */
export const WORKER_POS_DRIFT = 2
export const WORKER_VEL_DRIFT = 0.5

/** A lost sync ack stops gating resync after this many frames without a reply. */
export const LOST_SYNC_FRAMES = 30

/** Main→worker correction for one id-verified ball: the worker resolves the id to its own slot. */
export type MirrorTeleport = {
	id: number
	pos: [number, number, number]
	vel: [number, number, number]
	frozen: boolean
}

export type MirrorFrameResult = {
	/** Main→worker corrections, one per matched ball whose drift exceeded budget. */
	teleports: MirrorTeleport[]
	/** Movers of id-matched balls: skip their integration, the mirror overwrites them. */
	skip: Set<MoverObject>
	/** Any unmatched worker slot or unmatched main ball (counts included). Feeds the resync streak. */
	miss: boolean
}

/** Id-verified mirror apply for one claimed worker frame: each slot is matched to a
 * main-thread ball by `BALL_ID`, never by slot index, so a destroy/create shift cannot
 * alias a newborn onto a stale slot. Matched balls within drift copy worker→main;
 * matched balls beyond drift teleport main→worker by id; unmatched worker slots are
 * skipped and unmatched main balls keep their local sim. */
export function mirrorWorkerFrame(mainBalls: Ball[], scratch: Float32Array, count: number): MirrorFrameResult {
	const teleports: MirrorTeleport[] = []
	const skip = new Set<MoverObject>()
	const byId = new Map<number, Ball>()
	for (const ball of mainBalls) byId.set(ball.id, ball)
	let miss = count !== mainBalls.length
	for (let slot = 0; slot < count; slot++) {
		const off = slot * BALL_STRIDE
		const ball = byId.get(scratch[off + BALL_ID])
		// Unmatched worker slot (stale id the main thread already destroyed): skip it.
		if (!ball) {
			miss = true
			continue
		}
		byId.delete(ball.id)
		skip.add(ball.getMover())
		const pos = ball.state.pos
		const vel = ball.hit.vel
		const dx = pos.x - scratch[off + BALL_POS]
		const dy = pos.y - scratch[off + BALL_POS + 1]
		const dz = pos.z - scratch[off + BALL_POS + 2]
		const dvx = vel.x - scratch[off + BALL_VEL]
		const dvy = vel.y - scratch[off + BALL_VEL + 1]
		const dvz = vel.z - scratch[off + BALL_VEL + 2]
		const workerFrozen = scratch[off + BALL_FROZEN] !== 0
		// A frozen-flag-only script edit (hold, release, capture) moves nothing,
		// so the drift budgets below never catch it — forward it explicitly.
		// Main is authoritative for game state, so any frozen mismatch teleports
		// main→worker and converges within a frame.
		if (
			Math.hypot(dx, dy, dz) > WORKER_POS_DRIFT ||
			Math.hypot(dvx, dvy, dvz) > WORKER_VEL_DRIFT ||
			ball.state.isFrozen !== workerFrozen
		) {
			// Verified slot only: the id came from a live main-thread ball.
			teleports.push({
				id: ball.id,
				pos: [pos.x, pos.y, pos.z],
				vel: [vel.x, vel.y, vel.z],
				frozen: ball.state.isFrozen,
			})
		} else {
			pos.x = scratch[off + BALL_POS]
			pos.y = scratch[off + BALL_POS + 1]
			pos.z = scratch[off + BALL_POS + 2]
			vel.x = scratch[off + BALL_VEL]
			vel.y = scratch[off + BALL_VEL + 1]
			vel.z = scratch[off + BALL_VEL + 2]
			ball.state.isFrozen = workerFrozen
			// The skipped ball integrators no longer refresh these, but the
			// still-running hit-test and hit-event filter consume them — account
			// the mirrored travel and bbox here instead.
			ball.hit.lastEventSqrDist += dx * dx + dy * dy + dz * dz
			ball.hit.calcHitBBox()
		}
	}
	// Leftover main balls (destroyed worker-side or never synced): local sim stands.
	if (byId.size > 0) miss = true
	return { teleports, skip, miss }
}

/** Backed-off resync gate: a miss streak alone is not enough — an in-flight sync
 * (until acked or declared lost) and a minimum gap since the last sync suppress storms. */
export function shouldResyncMirror(
	streak: number,
	inflightEpoch: number | null | undefined,
	framesSinceSync: number,
): boolean {
	return streak >= 2 && inflightEpoch == null && framesSinceSync >= 5
}

/** Fresh ack only: an ack whose epoch is not the in-flight one is stale (a replaced
 * lifecycle sync, or a duplicate) and must not clear the current gate. */
export function isFreshSyncAck(inflightEpoch: number | null | undefined, epoch: number): boolean {
	return inflightEpoch != null && epoch === inflightEpoch
}
