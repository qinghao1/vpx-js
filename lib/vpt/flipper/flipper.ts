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
import { degToRad } from '../../math/float.js'
import { Matrix3D } from '../../math/matrix3d.js'
import type { Vertex2D } from '../../math/vertex2d.js'
import type { HitObject } from '../../physics/hit-object.js'
import { Item } from '../item.js'
import type { Table } from '../table/table.js'
import { FlipperApi } from './flipper-api.js'
import { FlipperData } from './flipper-data.js'
import { FlipperHit } from './flipper-hit.js'
import { FlipperMesh } from './flipper-mesh.js'
import type { FlipperMover } from './flipper-mover.js'
import { FlipperState } from './flipper-state.js'
import { FlipperUpdater } from './flipper-updater.js'

/**
 * VPinball's flippers
 *
 * @see https://github.com/vpinball/vpinball/blob/master/flipper.cpp
 */
export class Flipper
	extends Item<FlipperData>
	implements IRenderable<FlipperState>, IPlayable, IMovable, IHittable, IScriptable<FlipperApi>
{
	private readonly mesh: FlipperMesh
	private readonly state: FlipperState
	private readonly updater: FlipperUpdater
	private hit?: FlipperHit
	private api?: FlipperApi

	public static async fromStorage(storage: Storage, itemName: string): Promise<Flipper> {
		const data = await FlipperData.fromStorage(storage, itemName)
		return new Flipper(data)
	}

	public constructor(data: FlipperData) {
		super(data)
		this.mesh = new FlipperMesh()
		this.state = FlipperState.claim(
			this.getName(),
			this.data.startAngle,
			this.data.center.clone(),
			this.data.isVisible,
			this.data.szMaterial!,
			this.data.szImage!,
			this.data.szRubberMaterial!,
		)
		this.updater = new FlipperUpdater(this.data, this.state)
	}

	public isCollidable(): boolean {
		return true
	}

	public getMover(): FlipperMover {
		return this.hit!.getMoverObject()
	}

	public getState(): FlipperState {
		return this.state
	}

	public setupPlayer(player: Player, table: Table): void {
		this.events = new EventProxy(this)
		this.hit = FlipperHit.getInstance(this.data, this.state, this.events, player.getPhysics(), table)
		this.api = new FlipperApi(this.data, this.state, this.hit, this.getMover(), this.events, player, table)
	}

	public getApi(): FlipperApi {
		return this.api!
	}

	public getHitShapes(): HitObject[] {
		return [this.hit!]
	}

	public getMeshes<GEOMETRY>(table: Table): Meshes<GEOMETRY> {
		const meshes: Meshes<GEOMETRY> = {}

		const matrix = this.getMatrix().toRightHanded()
		const flipper = this.mesh.generateMeshes(this.data, table)

		// base mesh
		meshes.base = {
			isVisible: this.data.isVisible,
			mesh: flipper.base.transform(matrix),
			material: table.getMaterial(this.data.szMaterial),
			map: table.getTexture(this.data.szImage),
		}

		// rubber mesh
		if (flipper.rubber) {
			meshes.rubber = {
				isVisible: this.data.isVisible,
				mesh: flipper.rubber.transform(matrix),
				material: table.getMaterial(this.data.szRubberMaterial),
			}
		}
		return meshes
	}

	public getFlipperData(): FlipperData {
		return this.data
	}

	private getMatrix(rotation: number = this.data.startAngle): Matrix3D {
		const trafoMatrix = new Matrix3D()
		const tempMatrix = Matrix3D.claim()
		trafoMatrix.setTranslation(this.data.center.x, this.data.center.y, 0)
		tempMatrix.rotateZMatrix(degToRad(rotation))
		trafoMatrix.preMultiply(tempMatrix)

		Matrix3D.release(tempMatrix)
		return trafoMatrix
	}

	public getEventNames(): string[] {
		return ['Init', 'Timer', 'LimitEOS', 'LimitBOS', 'Hit', 'Collide']
	}

	public getUpdater(): FlipperUpdater {
		return this.updater
	}
}

export interface FlipperConfig {
	center: Vertex2D
	baseRadius: number
	endRadius: number
	flipperRadius: number
	angleStart: number
	angleEnd: number
	zLow: number
	zHigh: number
}
