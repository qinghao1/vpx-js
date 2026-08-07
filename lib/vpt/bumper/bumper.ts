// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EventProxy } from '../../game/event-proxy.js'
import type { IAnimatable } from '../../game/ianimatable.js'
import type { IHittable } from '../../game/ihittable.js'
import type { IRenderable, Meshes } from '../../game/irenderable.js'
import type { IScriptable } from '../../game/iscriptable.js'
import type { Player } from '../../game/player.js'
import type { Storage } from '../../io/ole-doc.js'
import { Matrix3D } from '../../math/matrix3d.js'
import type { HitObject } from '../../physics/hit-object.js'
import { Item } from '../item.js'
import type { Table } from '../table/table.js'
import { Texture } from '../texture.js'
import { BumperAnimation } from './bumper-animation.js'
import { BumperApi } from './bumper-api.js'
import { BumperData } from './bumper-data.js'
import { BumperHit } from './bumper-hit.js'
import { BumperMeshGenerator } from './bumper-mesh-generator.js'
import { BumperState } from './bumper-state.js'
import { BumperUpdater } from './bumper-updater.js'

/**
 * VPinball's bumper item.
 *
 * @see https://github.com/vpinball/vpinball/blob/master/bumper.cpp
 */
export class Bumper
	extends Item<BumperData>
	implements IRenderable<BumperState>, IHittable, IAnimatable, IScriptable<BumperApi>
{
	private readonly meshGenerator: BumperMeshGenerator
	private readonly state: BumperState
	private readonly updater: BumperUpdater
	private hit?: BumperHit
	private animation?: BumperAnimation
	private api?: BumperApi

	public static async fromStorage(storage: Storage, itemName: string): Promise<Bumper> {
		const data = await BumperData.fromStorage(storage, itemName)
		return new Bumper(data)
	}

	public constructor(data: BumperData) {
		super(data)
		this.state = BumperState.claim(
			this.getName(),
			0,
			0,
			0,
			data.isCapVisible,
			data.isRingVisible,
			data.isBaseVisible,
			data.isSkirtVisible,
			data.szCapMaterial,
			data.szRingMaterial,
			data.szBaseMaterial,
			data.szSkirtMaterial,
		)
		this.meshGenerator = new BumperMeshGenerator(data)
		this.updater = new BumperUpdater(this.state, this.data)
	}

	public getState(): BumperState {
		return this.state
	}

	public isCollidable(): boolean {
		return this.data.isCollidable
	}

	public setupPlayer(player: Player, table: Table): void {
		const height = table.getSurfaceHeight(this.data.szSurface, this.data.center.x, this.data.center.y)
		this.events = new EventProxy(this)
		this.animation = new BumperAnimation(this.data, this.state)
		this.hit = new BumperHit(this.data, this.state, this.animation, this.events, height)
		this.api = new BumperApi(this.state, this.animation, this.data, this.events, player, table)
	}

	public getApi(): BumperApi {
		return this.api!
	}

	public getEventNames(): string[] {
		return ['Init', 'Timer', 'Hit']
	}

	public getUpdater(): BumperUpdater {
		return this.updater
	}

	public getHitShapes(): HitObject[] {
		return [this.hit!]
	}

	public getAnimation(): BumperAnimation {
		return this.animation!
	}

	public getMeshes<GEOMETRY>(table: Table): Meshes<GEOMETRY> {
		const bumper = this.meshGenerator.getMeshes(table)
		return {
			base: {
				isVisible: this.data.isBaseVisible,
				mesh: bumper.base.transform(Matrix3D.RIGHT_HANDED),
				material: table.getMaterial(this.data.szBaseMaterial),
				map: Texture.fromFilesystem('bumperbase.png'),
			},
			ring: {
				isVisible: this.data.isRingVisible,
				mesh: bumper.ring.transform(Matrix3D.RIGHT_HANDED),
				material: table.getMaterial(this.data.szRingMaterial),
				map: Texture.fromFilesystem('bumperring.png'),
			},
			skirt: {
				isVisible: this.data.isSkirtVisible,
				mesh: bumper.skirt.transform(Matrix3D.RIGHT_HANDED),
				material: table.getMaterial(this.data.szSkirtMaterial),
				map: Texture.fromFilesystem('bumperskirt.png'),
			},
			cap: {
				isVisible: this.data.isCapVisible,
				mesh: bumper.cap.transform(Matrix3D.RIGHT_HANDED),
				material: table.getMaterial(this.data.szCapMaterial),
				map: Texture.fromFilesystem('bumperCap.png'),
			},
		}
	}
}
