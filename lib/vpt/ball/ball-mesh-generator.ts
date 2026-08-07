// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Mesh } from '../mesh.js'
import { loadMesh } from '../mesh-loader.js'
import type { BallData } from './ball-data.js'

const ballMesh = loadMesh('ball-mesh')

/** Generates ball mesh. @see https://github.com/vpinball/vpinball/blob/master/ball.cpp */
export class BallMeshGenerator {
	constructor(private readonly data: BallData) {}
	public getMesh(): Mesh {
		return ballMesh.clone()
	}
}
