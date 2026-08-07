// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/**
 * Spinner, Gate, Flipper, Plunger and Ball
 */
import type { PlayerPhysics } from '../game/player-physics.js'

export interface MoverObject {
	updateDisplacements(dTime: number): void

	updateVelocities(physics: PlayerPhysics): void
}
