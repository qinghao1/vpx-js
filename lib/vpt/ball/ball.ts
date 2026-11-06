// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Matrix3D } from '../../math/matrix.js'
import { Vertex3D } from '../../math/vector.js'
import type { IRenderApi, Meshes } from '../../render/irender-api.js'
import { Material } from '../material.js'
import type { Table } from '../table/table.js'
import { Texture } from '../texture.js'
import type { BallData } from './ball-data.js'
import { BallMeshGenerator } from './ball-mesh-generator.js'
import type { BallState } from './ball-state.js'
import { BallUpdater } from './ball-updater.js'

/** Runtime ball — renderable WASM snapshot. @see https://github.com/vpinball/vpinball/blob/master/ball.cpp */
export class Ball {
	public static idCounter = 0
	public oldVel = new Vertex3D()
	private readonly meshGenerator: BallMeshGenerator
	private readonly updater: BallUpdater

	constructor(
		public id: number,
		public readonly data: BallData,
		public readonly state: BallState,
	) {
		this.meshGenerator = new BallMeshGenerator(data)
		this.updater = new BallUpdater(this.state, this.data)
	}

	public getName(): string {
		return `Ball${this.id}`
	}
	public getState(): BallState {
		return this.state
	}
	public getUpdater(): BallUpdater {
		return this.updater
	}
	public async addToScene<NODE, GEOMETRY, POINT_LIGHT>(
		scene: NODE,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): Promise<NODE> {
		const mesh = renderApi.createObjectFromRenderable(this, table, {})
		const playfield = renderApi.findInGroup(scene, 'playfield')!
		const balls = renderApi.findInGroup(playfield, 'balls')!
		renderApi.addChildToParent(balls, mesh)
		return mesh
	}

	public removeFromScene<NODE, GEOMETRY, POINT_LIGHT>(
		scene: NODE,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
	): void {
		const playfield = renderApi.findInGroup(scene, 'playfield')!
		const group = renderApi.findInGroup(playfield, 'balls')!
		const ball = renderApi.findInGroup(group, this.getName())
		renderApi.removeFromParent(group, ball)
	}

	public getMeshes<GEOMETRY>(_table: Table): Meshes<GEOMETRY> {
		return {
			ball: {
				isVisible: true,
				mesh: this.meshGenerator.getMesh().transform(Matrix3D.RIGHT_HANDED),
				envMap: Texture.fromFilesystem('ball.png'),
				material: this.getMaterial(),
				depthBias: -1,
			},
		}
	}

	private getMaterial(): Material {
		const m = new Material()
		m.name = 'ball'
		m.isMetal = true
		m.baseColor = 0xc0c0c0
		m.roughness = 0.8
		return m
	}
}
