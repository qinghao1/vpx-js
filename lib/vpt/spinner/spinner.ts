// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EventProxy } from '../../game/event-proxy.js'
import type { IHittable } from '../../game/ihittable.js'
import type { IMovable } from '../../game/imovable.js'
import type { IPlayable } from '../../game/iplayable.js'
import type { IRenderable, Meshes } from '../../game/irenderable.js'
import type { IScriptable } from '../../game/iscriptable.js'
import type { Player } from '../../game/player.js'
import type { Storage } from '../../io/ole-doc.js'
import { Matrix3D } from '../../math/matrix3d.js'
import type { HitCircle } from '../../physics/hit-circle.js'
import type { HitObject } from '../../physics/hit-object.js'
import type { MoverObject } from '../../physics/mover-object.js'
import { Item } from '../item.js'
import type { Table } from '../table/table.js'
import { SpinnerApi } from './spinner-api.js'
import { SpinnerData } from './spinner-data.js'
import { SpinnerHit } from './spinner-hit.js'
import { SpinnerHitGenerator } from './spinner-hit-generator.js'
import { SpinnerMeshGenerator } from './spinner-mesh-generator.js'
import { SpinnerState } from './spinner-state.js'
import { SpinnerUpdater } from './spinner-updater.js'

/**
 * VPinball's spinners.
 *
 * @see https://github.com/vpinball/vpinball/blob/master/spinner.cpp
 */
export class Spinner
	extends Item<SpinnerData>
	implements IRenderable<SpinnerState>, IPlayable, IMovable, IHittable, IScriptable<SpinnerApi>
{
	private readonly meshGenerator: SpinnerMeshGenerator
	private readonly state: SpinnerState
	private readonly hitGenerator: SpinnerHitGenerator
	private readonly updater: SpinnerUpdater
	private hit?: SpinnerHit
	private hitCircles: HitCircle[] = []
	private api?: SpinnerApi

	// public props
	get angleMin() {
		return this.data.angleMin
	}
	get angleMax() {
		return this.data.angleMax
	}

	public static async fromStorage(storage: Storage, itemName: string): Promise<Spinner> {
		const data = await SpinnerData.fromStorage(storage, itemName)
		return new Spinner(data)
	}

	public constructor(data: SpinnerData) {
		super(data)
		this.state = SpinnerState.claim(
			this.data.getName(),
			0,
			data.szImage,
			data.szMaterial,
			data.showBracket,
			data.isVisible,
		)
		this.meshGenerator = new SpinnerMeshGenerator(data)
		this.hitGenerator = new SpinnerHitGenerator(data)
		this.updater = new SpinnerUpdater(this.state, this.data, this.meshGenerator)
	}

	public isCollidable(): boolean {
		return true
	}

	public getMeshes<GEOMETRY>(table: Table): Meshes<GEOMETRY> {
		const spinner = this.meshGenerator.generateMeshes(table)
		const meshes: Meshes<GEOMETRY> = {}

		return {
			plate: {
				isVisible: this.data.isVisible,
				mesh: spinner.plate.transform(Matrix3D.RIGHT_HANDED),
				map: table.getTexture(this.data.szImage),
				material: table.getMaterial(this.data.szMaterial),
			},
			bracket: {
				isVisible: this.data.isVisible && this.data.showBracket,
				mesh: spinner.bracket.transform(Matrix3D.RIGHT_HANDED),
				map: table.getTexture(this.data.szImage),
				material: table.getMaterial(this.data.szMaterial),
			},
		}
	}

	public setupPlayer(player: Player, table: Table): void {
		const height = table.getSurfaceHeight(this.data.szSurface, this.data.center.x, this.data.center.y)
		this.events = new EventProxy(this)
		this.hit = new SpinnerHit(this.data, this.state, this.events, height)
		this.hitCircles = this.hitGenerator.getHitShapes(this.state, height)
		this.api = new SpinnerApi(this.state, this.hit.getMoverObject(), this.data, this.events, player, table)
	}

	public getApi(): SpinnerApi {
		return this.api!
	}

	public getEventNames(): string[] {
		return ['Init', 'LimitBOS', 'LimitEOS', 'Spin', 'Timer']
	}

	public getHitShapes(): HitObject[] {
		return [this.hit!, ...this.hitCircles]
	}

	public getMover(): MoverObject {
		return this.hit!.getMoverObject()
	}

	public getState(): SpinnerState {
		return this.state
	}

	public getUpdater(): SpinnerUpdater {
		return this.updater
	}
}
