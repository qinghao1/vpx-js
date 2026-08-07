// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EventProxy } from '../../game/event-proxy.js'
import type { IHittable } from '../../game/ihittable.js'
import type { IRenderable, Meshes } from '../../game/irenderable.js'
import type { IScriptable } from '../../game/iscriptable.js'
import type { Player } from '../../game/player.js'
import type { Storage } from '../../io/ole-doc.js'
import { Matrix3D } from '../../math/matrix3d.js'
import type { HitObject } from '../../physics/hit-object.js'
import { Item } from '../item.js'
import type { Table } from '../table/table.js'
import { RubberApi } from './rubber-api.js'
import { RubberData } from './rubber-data.js'
import { RubberHitGenerator } from './rubber-hit-generator.js'
import { RubberMeshGenerator } from './rubber-mesh-generator.js'
import { RubberState } from './rubber-state.js'
import { RubberUpdater } from './rubber-updater.js'

/** Rubber item. @see https://github.com/vpinball/vpinball/blob/master/rubber.cpp */
export class Rubber extends Item<RubberData> implements IRenderable<RubberState>, IHittable, IScriptable<RubberApi> {
	private readonly state: RubberState
	private readonly meshGenerator: RubberMeshGenerator
	private readonly updater: RubberUpdater
	private hitGenerator: RubberHitGenerator
	private hits: HitObject[] = []
	private api!: RubberApi

	public static async fromStorage(storage: Storage, itemName: string): Promise<Rubber> {
		const data = await RubberData.fromStorage(storage, itemName)
		return new Rubber(data)
	}

	public constructor(data: RubberData) {
		super(data)
		this.state = RubberState.claim(
			data.getName(),
			data.height,
			data.rotX,
			data.rotY,
			data.rotZ,
			data.szMaterial!,
			data.szImage!,
			data.isVisible,
		)
		this.meshGenerator = new RubberMeshGenerator(data)
		this.hitGenerator = new RubberHitGenerator(data, this.meshGenerator)
		this.updater = new RubberUpdater(this.data, this.state, this.meshGenerator.middlePoint)
	}

	public isCollidable(): boolean {
		return this.data.isCollidable
	}

	public getMeshes<GEOMETRY>(table: Table): Meshes<GEOMETRY> {
		const mesh = this.meshGenerator.getMeshes(table)
		return {
			rubber: {
				isVisible: this.data.isVisible,
				mesh: mesh.transform(Matrix3D.RIGHT_HANDED),
				map: table.getTexture(this.data.szImage),
				material: table.getMaterial(this.data.szMaterial),
			},
		}
	}

	public setupPlayer(player: Player, table: Table): void {
		this.events = new EventProxy(this)
		this.hits = this.hitGenerator.generateHitObjects(this.events, table)
		this.api = new RubberApi(this.state, this.hits, this.data, this.events, player, table)
	}

	public getApi(): RubberApi {
		return this.api!
	}

	public getHitShapes(): HitObject[] {
		return this.hits
	}

	public getEventNames(): string[] {
		return ['Hit', 'Init', 'Timer']
	}

	public getState(): RubberState {
		return this.state
	}

	public getUpdater(): RubberUpdater {
		return this.updater
	}
}
