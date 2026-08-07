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

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Mesh } from '../mesh'
import type { BallData } from './ball-data'

const ballMeshJson = JSON.parse(readFileSync(resolve(process.cwd(), 'res/meshes/ball-mesh.json'), 'utf-8'))

const ballMesh = ballMeshJson

/**
 * This class creates a ball mesh.
 */
export class BallMeshGenerator {
	private readonly data: BallData

	constructor(data: BallData) {
		this.data = data
	}

	public getMesh(): Mesh {
		return Mesh.fromJson(ballMesh)
	}
}
