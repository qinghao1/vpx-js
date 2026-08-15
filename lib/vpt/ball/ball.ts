// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EventProxy } from '../../game/event-proxy.js'
import type { IMovable } from '../../game/imovable.js'
import type { IPlayable } from '../../game/iplayable.js'
import type { IRenderable, Meshes } from '../../game/irenderable.js'
import type { IScriptable } from '../../game/iscriptable.js'
import type { Player } from '../../game/player.js'
import type { HitObject } from '../../physics/hit-object.js'
import type { IRenderApi } from '../../render/irender-api.js'
import { Matrix3D } from '../../util/matrix.js'
import { Vertex3D } from '../../util/vector.js'
import { Material } from '../material.js'
import type { Table } from '../table/table.js'
import { Texture } from '../texture.js'
import { BallApi } from './ball-api.js'
import type { BallData } from './ball-data.js'
import { BallHit } from './ball-hit.js'
import { BallMeshGenerator } from './ball-mesh-generator.js'
import type { BallMover } from './ball-mover.js'
import type { BallState } from './ball-state.js'
import { BallUpdater } from './ball-updater.js'

/** Runtime ball — playable, movable and renderable. @see https://github.com/vpinball/vpinball/blob/master/ball.cpp */
export class Ball implements IPlayable, IMovable, IRenderable<BallState>, IScriptable<BallApi> {
	public static idCounter = 0
	public oldVel = new Vertex3D()
	public readonly hit: BallHit
	private readonly meshGenerator: BallMeshGenerator
	private readonly events: EventProxy
	private readonly api: BallApi
	private readonly updater: BallUpdater
	get coll() {
		return this.hit.coll
	}

	constructor(
		public id: number,
		public readonly data: BallData,
		public readonly state: BallState,
		initialVelocity: Vertex3D,
		player: Player,
		table: Table,
	) {
		this.meshGenerator = new BallMeshGenerator(data)
		this.events = new EventProxy(this)
		this.hit = new BallHit(this, this.data, this.state, initialVelocity, table.data!)
		this.api = new BallApi(this, this.state, this.hit, this.data, this.events, player, table)
		this.updater = new BallUpdater(this.state, this.data)
	}

	public getName(): string {
		return `Ball${this.id}`
	}
	public getState(): BallState {
		return this.state
	}
	public getMover(): BallMover {
		return this.hit.getMoverObject()
	}
	public getUpdater(): BallUpdater {
		return this.updater
	}
	public getApi(): BallApi {
		return this.api
	}
	public getHitShapes(): HitObject[] {
		return [this.hit]
	}
	public isCollidable(): boolean {
		return true
	}
	public setupPlayer(): void {}
	public getEventNames(): string[] {
		return []
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
