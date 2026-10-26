/*
 * VPDB - Virtual Pinball Database
 * Copyright (C) 2019 freezy <freezy@vpdb.io>
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 */

import type { Player } from '../lib/game/player'
import type { PlayerPhysics } from '../lib/game/player-physics'
import { Vertex3D } from '../lib/math/vector.js'
import type { Ball } from '../lib/vpt/ball/ball'
import type { Table } from '../lib/vpt/table/table'

/**
 * Creates a ball at (x, y, z) with velocity (vx, vy, vz).
 * @param opts Ball radius and mass (defaults match Player.createBall)
 */
export function createBall(
	player: Player,
	x: number,
	y: number,
	z: number,
	vx = 0,
	vy = 0,
	vz = 0,
	opts: { radius?: number; mass?: number } = {},
): Ball {
	const { radius = 25, mass = 1 } = opts
	return player.createBall(
		{
			getBallCreationPosition(_t: Table): Vertex3D {
				return new Vertex3D(x, y, z)
			},
			getBallCreationVelocity(_t: Table): Vertex3D {
				return new Vertex3D(vx, vy, vz)
			},
			onBallCreated(_p: PlayerPhysics, _b: Ball): void {
				// do nothing
			},
		},
		radius,
		mass,
	)
}
