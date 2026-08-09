// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EventProxy } from '../../game/event-proxy.js'
import type { IHittable } from '../../game/ihittable.js'
import type { IRenderable, Meshes } from '../../game/irenderable.js'
import type { IScriptable } from '../../game/iscriptable.js'
import type { IBallCreationPosition, Player } from '../../game/player.js'
import type { PlayerPhysics } from '../../game/player-physics.js'
import type { Storage } from '../../io/ole-doc.js'
import type { HitObject } from '../../physics/hit-object.js'
import { FLT_MAX } from '../../util/float.js'
import { Vertex3D } from '../../util/vector.js'
import { Matrix3D } from '../../util/matrix.js'
import type { Ball } from '../ball/ball.js'
import { Enums } from '../enums.js'
import { Item } from '../item.js'
import type { Table } from '../table/table.js'
import { Texture } from '../texture.js'
import { KickerApi } from './kicker-api.js'
import { KickerData } from './kicker-data.js'
import { KickerHit } from './kicker-hit.js'
import { KickerMeshGenerator } from './kicker-mesh-generator.js'
import { KickerState } from './kicker-state.js'
import { KickerUpdater } from './kicker-updater.js'

/** Kicker item. @see https://github.com/vpinball/vpinball/blob/master/kicker.cpp */
export class Kicker
	extends Item<KickerData>
	implements IRenderable<KickerState>, IHittable, IBallCreationPosition, IScriptable<KickerApi>
{
	private readonly meshGenerator: KickerMeshGenerator
	private readonly state: KickerState
	private readonly updater: KickerUpdater
	private hit?: KickerHit
	private api?: KickerApi

	public static async fromStorage(storage: Storage, itemName: string): Promise<Kicker> {
		const data = await KickerData.fromStorage(storage, itemName)
		return new Kicker(data)
	}

	public constructor(data: KickerData) {
		super(data)
		this.state = KickerState.claim(data.getName(), data.kickerType, data.szMaterial)
		this.meshGenerator = new KickerMeshGenerator(data)
		this.updater = new KickerUpdater(this.state)
	}

	public isCollidable(): boolean {
		return true
	}

	public getMeshes<GEOMETRY>(table: Table): Meshes<GEOMETRY> {
		return {
			kicker: {
				isVisible: this.data.kickerType !== Enums.KickerType.KickerInvisible,
				mesh: this.meshGenerator.getMesh(table).transform(Matrix3D.RIGHT_HANDED),
				material: table.getMaterial(this.data.szMaterial),
				map: this.getTexture(),
			},
		}
	}

	public setupPlayer(player: Player, table: Table): void {
		const height =
			table.getSurfaceHeight(this.data.szSurface, this.data.center.x, this.data.center.y) * table.getScaleZ()
		const radius = this.data.radius * (this.data.legacyMode ? (this.data.fallThrough ? 0.75 : 0.6) : 1)
		this.events = new EventProxy(this)
		this.hit = new KickerHit(this.data, this.events, table, radius, height)
		this.api = new KickerApi(this.state, this.data, this.hit, this.events, this, player, table)
	}

	public getApi(): KickerApi {
		return this.api!
	}

	public getState(): KickerState {
		return this.state
	}

	public getUpdater(): KickerUpdater {
		return this.updater
	}

	public getHitShapes(): HitObject[] {
		return [this.hit!]
	}

	public getBallCreationPosition(table: Table): Vertex3D {
		const height = table.getSurfaceHeight(this.data.szSurface, this.data.center.x, this.data.center.y)
		return new Vertex3D(this.hit?.center.x, this.hit?.center.y, height)
	}

	public getBallCreationVelocity(_table: Table): Vertex3D {
		return new Vertex3D(0.1, 0, 0)
	}

	public onBallCreated(physics: PlayerPhysics, ball: Ball): void {
		ball.coll.hitFlag = true
		const hitNormal = new Vertex3D(FLT_MAX, FLT_MAX, FLT_MAX)
		this.hit?.doCollide(physics, ball, hitNormal, false, true)
	}

	private getTexture(): Texture {
		switch (this.data.kickerType) {
			case Enums.KickerType.KickerCup:
				return Texture.fromFilesystem('kickerCup.png')
			case Enums.KickerType.KickerWilliams:
				return Texture.fromFilesystem('kickerWilliams.png')
			case Enums.KickerType.KickerGottlieb:
				return Texture.fromFilesystem('kickerGottlieb.png')
			case Enums.KickerType.KickerCup2:
				return Texture.fromFilesystem('kickerT1.png')
			case Enums.KickerType.KickerHole:
				return Texture.fromFilesystem('kickerHoleWood.png')
			default:
				return Texture.fromFilesystem('kickerHoleWood.png')
		}
	}

	public getEventNames(): string[] {
		return ['Init', 'Hit', 'Unhit', 'Timer']
	}
}
