// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EventProxy } from '../../game/event-proxy.js'
import type { IAnimatable, IAnimation } from '../../game/ianimatable.js'
import type { IHittable } from '../../game/ihittable.js'
import type { IRenderable, Meshes } from '../../game/irenderable.js'
import type { IScriptable } from '../../game/iscriptable.js'
import type { Player } from '../../game/player.js'
import type { Storage } from '../../io/ole-doc.js'
import type { HitObject } from '../../physics/hit-object.js'
import { Matrix3D } from '../../util/matrix.js'
import type { Ball } from '../ball/ball.js'
import { Item } from '../item.js'
import type { Table } from '../table/table.js'
import { HitTargetAnimation } from './hit-target-animation.js'
import { HitTargetApi } from './hit-target-api.js'
import { HitTargetData } from './hit-target-data.js'
import { HitTargetHitGenerator } from './hit-target-hit-generator.js'
import { HitTargetMeshGenerator } from './hit-target-mesh-generator.js'
import { HitTargetState } from './hit-target-state.js'
import { HitTargetUpdater } from './hit-target-updater.js'

/** HitTarget item. @see https://github.com/vpinball/vpinball/blob/master/hittarget.cpp */
export class HitTarget
	extends Item<HitTargetData>
	implements IRenderable<HitTargetState>, IHittable, IAnimatable, IScriptable<HitTargetApi>
{
	public static DROP_TARGET_LIMIT = 52.0

	private readonly state: HitTargetState
	private readonly meshGenerator: HitTargetMeshGenerator
	private readonly hitGenerator: HitTargetHitGenerator
	private readonly updater: HitTargetUpdater
	private animation?: HitTargetAnimation
	private hits?: HitObject[]
	private api?: HitTargetApi

	public static async fromStorage(storage: Storage, itemName: string): Promise<HitTarget> {
		const data = await HitTargetData.fromStorage(storage, itemName)
		return new HitTarget(data)
	}

	public constructor(data: HitTargetData) {
		super(data)
		this.state = HitTargetState.claim(this.data.getName(), 0.0, 0.0, data.szMaterial, data.szImage, data.isVisible)
		this.meshGenerator = new HitTargetMeshGenerator(data)
		this.hitGenerator = new HitTargetHitGenerator(data, this.meshGenerator)
		this.updater = new HitTargetUpdater(this.data, this.state)
	}

	public isCollidable(): boolean {
		return this.data.isCollidable
	}

	public getMeshes<GEOMETRY>(table: Table): Meshes<GEOMETRY> {
		const m = table.getMaterial(this.data.szMaterial)
		const isTransparent = !m || (m.isOpacityActive && m.opacity < 0.999)
		return {
			hitTarget: {
				isVisible: this.data.isVisible,
				mesh: this.meshGenerator.getMesh(table).transform(Matrix3D.RIGHT_HANDED),
				map: table.getTexture(this.data.szImage),
				material: m,
				isTransparent,
				depthBias: this.data.depthBias ?? 0,
				disableLighting: this.data.disableLightingTop,
			},
		}
	}

	public setupPlayer(player: Player, table: Table): void {
		this.events = new EventProxy(this)
		this.events.onCollision = (obj: HitObject, ball: Ball, dot: number) => {
			if (!this.data.isDropped) {
				this.animation!.hitEvent = true
				this.events!.currentHitThreshold = dot
				obj.fireHitEvent(ball)
			}
		}
		this.events.abortHitTest = () => {
			return this.data.isDropped
		}
		this.animation = new HitTargetAnimation(this.data, this.state, this.events)
		this.hits = this.hitGenerator.generateHitObjects(this.events, table)
		this.api = new HitTargetApi(this.state, this.data, this.hits, this.animation, this.events, player, table)
	}

	public getState(): HitTargetState {
		return this.state
	}

	public getApi(): HitTargetApi {
		return this.api!
	}

	public getHitShapes(): HitObject[] {
		return this.hits!
	}

	public getAnimation(): IAnimation {
		return this.animation!
	}

	public getUpdater(): HitTargetUpdater {
		return this.updater
	}

	public getEventNames(): string[] {
		return ['Dropped', 'Hit', 'Init', 'Raised', 'Timer']
	}
}
