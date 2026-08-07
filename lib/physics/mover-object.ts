// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { PlayerPhysics } from '../game/player-physics.js'

/** Physics-moved object (flipper, gate, plunger, ball, spinner). */
export interface MoverObject {
	updateDisplacements(dTime: number): void
	updateVelocities(physics: PlayerPhysics): void
}
