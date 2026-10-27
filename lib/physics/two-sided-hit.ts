// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Ball } from '../vpt/ball/ball.js'
import type { CollisionEvent } from './collision-event.js'
import type { LineSeg } from './line-seg.js'

/**
 * Two-sided hit test for the gate and spinner paddles.
 *
 * Both parts collide as a pair of opposing segments; the side that hits is
 * signalled to `collide()` through `coll.hitFlag`, but with opposite polarity
 * (upstream `collideex.cpp`: `HitGate::HitTest` stores `!!i`, `HitSpinner::HitTest`
 * stores `!i`).
 *
 * @param segments exactly the two opposing segments
 * @param ball rolling ball
 * @param dTime time window
 * @param coll collision target
 * @param invertPolarity gate passes `false`, spinner passes `true`
 */
export function hitTestTwoSided(
	segments: readonly (LineSeg | undefined)[],
	ball: Ball,
	dTime: number,
	coll: CollisionEvent,
	invertPolarity: boolean,
): number {
	for (let i = 0; i < 2; i++) {
		const hitTime = segments[i]?.hitTestBasic(ball, dTime, coll, false, true, false) // any face, lateral, non-rigid
		if (hitTime !== undefined && hitTime >= 0) {
			// signal the collide() function that the hit is on the front or back side
			coll.hitFlag = invertPolarity ? i === 0 : i === 1
			return hitTime
		}
	}
	return -1
}
