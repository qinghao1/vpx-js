// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EventProxy } from '../../game/event-proxy.js'
import type { IMovable } from '../../game/imovable.js'
import type { IPlayable } from '../../game/iplayable.js'
import type { IRenderable, Meshes } from '../../game/irenderable.js'
import type { IScriptable } from '../../game/iscriptable.js'
import type { Player } from '../../game/player.js'
import { Matrix3D } from '../../math/matrix3d.js'
import { Vertex3D } from '../../math/vertex3d.js'
import type { HitObject } from '../../physics/hit-object.js'
import type { IRenderApi } from '../../render/irender-api.js'
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

/** Runtime ball. */
export class Ball implements IPlayable, IMovable, IRenderable<BallState>, IScriptable<BallApi> {
	public readonly state: BallState
	public readonly data: BallData
	public readonly hit: BallHit
	private readonly meshGenerator: BallMeshGenerator
	private readonly events: EventProxy
	private readonly api: BallApi
	private readonly updater: BallUpdater

	// unique ID for each ball
	public id: number

	// public props
	get coll() {
		return this.hit.coll
	}

	public static idCounter = 0

	// ugly hacks
	public oldVel: Vertex3D = new Vertex3D()

	constructor(id: number, data: BallData, state: BallState, initialVelocity: Vertex3D, player: Player, table: Table) {
		this.id = id
		this.data = data
		this.state = state
		this.meshGenerator = new BallMeshGenerator(data)
		this.events = new EventProxy(this)
		this.hit = new BallHit(this, this.data, this.state, initialVelocity, table.data!)
		this.api = new BallApi(this, this.state, this.hit, this.data, this.events, player, table)
		this.updater = new BallUpdater(this.state, this.data)
	}

	public getName(): string {
		return `Ball${this.id}`
	}

	public getUpdater(): BallUpdater {
		return this.updater
	}

	public async addToScene<NODE, GEOMETRY, POINT_LIGHT>(
		scene: NODE,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): Promise<NODE> {
		const ballMesh = renderApi.createObjectFromRenderable(this, table, {})
		const playfield = renderApi.findInGroup(scene, 'playfield')!
		const ballGroup = renderApi.findInGroup(playfield, 'balls')!
		renderApi.addChildToParent(ballGroup, ballMesh)
		return ballMesh
	}

	public removeFromScene<NODE, GEOMETRY, POINT_LIGHT>(
		scene: NODE,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
	): void {
		const playfield = renderApi.findInGroup(scene, 'playfield')!
		const ballGroup = renderApi.findInGroup(playfield, 'balls')!
		const ball = renderApi.findInGroup(ballGroup, this.getName())
		renderApi.removeFromParent(ballGroup, ball)
	}

	public getState(): BallState {
		return this.state
	}

	public getMover(): BallMover {
		return this.hit.getMoverObject()
	}

	/* istanbul ignore next: never called since there is no ball at player setup */
	public setupPlayer(): void {
		// there is no ball yet on player setup
	}

	/* istanbul ignore next: never called since balls have their own hit collection */
	public getHitShapes(): HitObject[] {
		return [this.hit]
	}

	public getApi(): BallApi {
		return this.api
	}

	public getMeshes<GEOMETRY>(table: Table): Meshes<GEOMETRY> {
		return {
			ball: {
				isVisible: true,
				mesh: this.meshGenerator.getMesh().transform(Matrix3D.RIGHT_HANDED),
				envMap: Texture.fromFilesystem('ball.png'),
				material: this.getMaterial(),
			},
		}
	}

	/* istanbul ignore next: balls have their own collidable treatment */
	public isCollidable(): boolean {
		return true
	}

	private getMaterial(): Material {
		const material = new Material()
		material.name = 'ball'
		material.isMetal = true
		material.baseColor = 0xffffff
		material.roughness = 0.8
		return material
	}

	public getEventNames(): string[] {
		return []
	}
}
