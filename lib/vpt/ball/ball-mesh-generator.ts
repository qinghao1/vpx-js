// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { Mesh } from '../mesh.js'
import type { BallData } from './ball-data.js'

const require = createRequire(import.meta.url)

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
