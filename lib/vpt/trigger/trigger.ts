// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EventProxy } from '../../game/event-proxy.js'
import type { IAnimatable, IAnimation } from '../../game/ianimatable.js'
import type { IHittable } from '../../game/ihittable.js'
import type { IRenderable, Meshes } from '../../game/irenderable.js'
import type { IScriptable } from '../../game/iscriptable.js'
import type { Player } from '../../game/player.js'
import type { Storage } from '../../io/ole-doc.js'
import { Matrix3D } from '../../math/matrix3d.js'
import type { HitObject } from '../../physics/hit-object.js'
import { Enums } from '../enums.js'
import { Item } from '../item.js'
import type { Table } from '../table/table.js'
import { TriggerAnimation } from './trigger-animation.js'
import { TriggerApi } from './trigger-api.js'
import { TriggerData } from './trigger-data.js'
import { TriggerHitCircle } from './trigger-hit-circle.js'
import { TriggerHitGenerator } from './trigger-hit-generator.js'
import { TriggerMeshGenerator } from './trigger-mesh-generator.js'
import { TriggerState } from './trigger-state.js'
import { TriggerUpdater } from './trigger-updater.js'

/**
 * VPinball's triggers.
 *
 * @see https://github.com/vpinball/vpinball/blob/master/trigger.cpp
 */
export class Trigger
	extends Item<TriggerData>
	implements IRenderable<TriggerState>, IHittable, IAnimatable, IScriptable<TriggerApi>
{
	private readonly state: TriggerState
	private readonly meshGenerator: TriggerMeshGenerator
	private readonly hitGenerator: TriggerHitGenerator
	private readonly updater: TriggerUpdater

	private api?: TriggerApi
	private hits?: HitObject[]
	private animation?: TriggerAnimation

	public static async fromStorage(storage: Storage, itemName: string): Promise<Trigger> {
		const data = await TriggerData.fromStorage(storage, itemName)
		return new Trigger(data)
	}

	public constructor(data: TriggerData) {
		super(data)
		this.state = TriggerState.claim(
			data.getName(),
			0,
			data.szMaterial,
			data.isVisible && data.shape !== Enums.TriggerShape.TriggerNone,
		)
		this.meshGenerator = new TriggerMeshGenerator(data)
		this.hitGenerator = new TriggerHitGenerator(data)
		this.updater = new TriggerUpdater(this.state)
	}

	public getState(): TriggerState {
		return this.state
	}

	public isCollidable(): boolean {
		return true
	}

	public getMeshes<GEOMETRY>(table: Table): Meshes<GEOMETRY> {
		return {
			trigger: {
				isVisible: this.data.isVisible,
				mesh: this.meshGenerator.getMesh(table).transform(Matrix3D.RIGHT_HANDED),
				material: table.getMaterial(this.data.szMaterial),
			},
		}
	}

	public setupPlayer(player: Player, table: Table): void {
		this.events = new EventProxy(this)
		this.animation = new TriggerAnimation(this.data, this.state)
		if (this.data.shape === Enums.TriggerShape.TriggerStar || this.data.shape === Enums.TriggerShape.TriggerButton) {
			this.hits = [new TriggerHitCircle(this.data, this.animation, this.events, table)]
		} else {
			this.hits = this.hitGenerator.generateHitObjects(this.animation, this.events, table)
		}
		this.api = new TriggerApi(this.state, this.data, this.events, player, table)
	}

	public getApi(): TriggerApi {
		return this.api!
	}

	public getHitShapes(): HitObject[] {
		return this.hits!
	}

	public getAnimation(): IAnimation {
		return this.animation!
	}

	public getUpdater(): TriggerUpdater {
		return this.updater
	}

	public getEventNames(): string[] {
		return ['Init', 'Hit', 'Unhit', 'Timer']
	}
}
