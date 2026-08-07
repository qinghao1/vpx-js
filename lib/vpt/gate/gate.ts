/*
 * VPDB - Virtual Pinball Database
 * Copyright (C) 2019 freezy <freezy@vpdb.io>
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 */

import { EventProxy } from '../../game/event-proxy'
import type { IHittable } from '../../game/ihittable'
import type { IMovable } from '../../game/imovable'
import type { IPlayable } from '../../game/iplayable'
import type { IRenderable, Meshes } from '../../game/irenderable'
import type { IScriptable } from '../../game/iscriptable'
import type { Player } from '../../game/player'
import type { Storage } from '../../io/ole-doc'
import { degToRad } from '../../math/float'
import { Matrix3D } from '../../math/matrix3d'
import { Vertex2D } from '../../math/vertex2d'
import type { HitCircle } from '../../physics/hit-circle'
import type { HitObject } from '../../physics/hit-object'
import type { LineSeg } from '../../physics/line-seg'
import { Item } from '../item'
import type { Table } from '../table/table'
import { GateApi } from './gate-api'
import { GateData } from './gate-data'
import type { GateHit } from './gate-hit'
import { GateHitGenerator } from './gate-hit-generator'
import { GateMeshGenerator } from './gate-mesh-generator'
import type { GateMover } from './gate-mover'
import { GateState } from './gate-state'
import { GateUpdater } from './gate-updater'

/**
 * VPinball's gates.
 *
 * @see https://github.com/vpinball/vpinball/blob/master/gate.cpp
 */
export class Gate
	extends Item<GateData>
	implements IRenderable<GateState>, IPlayable, IMovable, IHittable, IScriptable<GateApi>
{
	private readonly meshGenerator: GateMeshGenerator
	private readonly hitGenerator: GateHitGenerator
	private readonly state: GateState
	private readonly updater: GateUpdater
	private api?: GateApi
	private hitGate?: GateHit
	private hitLines?: LineSeg[]
	private hitCircles?: HitCircle[]

	public static async fromStorage(storage: Storage, itemName: string): Promise<Gate> {
		const data = await GateData.fromStorage(storage, itemName)
		return new Gate(data)
	}

	public constructor(data: GateData) {
		super(data)
		this.state = GateState.claim(this.getName(), 0, data.szMaterial, data.showBracket, data.isVisible)
		this.meshGenerator = new GateMeshGenerator(data)
		this.hitGenerator = new GateHitGenerator(data)
		this.updater = new GateUpdater(this.data, this.state)
	}

	public isCollidable(): boolean {
		return this.data.isCollidable
	}

	public getMeshes<GEOMETRY>(table: Table): Meshes<GEOMETRY> {
		const meshes: Meshes<GEOMETRY> = {}
		const gate = this.meshGenerator.getMeshes(table)

		// wire mesh
		return {
			wire: {
				isVisible: this.data.isVisible,
				mesh: gate.wire.transform(Matrix3D.RIGHT_HANDED),
				material: table.getMaterial(this.data.szMaterial),
			},
			bracket: {
				isVisible: this.data.isVisible && this.data.showBracket,
				mesh: gate.bracket.transform(Matrix3D.RIGHT_HANDED),
				material: table.getMaterial(this.data.szMaterial),
			},
		}
	}

	public setupPlayer(player: Player, table: Table): void {
		const height = table.getSurfaceHeight(this.data.szSurface, this.data.center.x, this.data.center.y)
		const radAngle = degToRad(this.data.rotation)
		const tangent = new Vertex2D(Math.cos(radAngle), Math.sin(radAngle))

		this.events = new EventProxy(this)
		this.hitGate = this.hitGenerator.generateGateHit(this.state, this.events, height)
		this.hitLines = this.hitGenerator.generateLineSegs(this.events, height, tangent)
		this.hitCircles = this.hitGenerator.generateBracketHits(this.state, this.events, height, tangent)
		this.api = new GateApi(
			this.data,
			this.events,
			this.state,
			this.getMover(),
			this.hitGate,
			this.hitLines.length ? this.hitLines[0] : null,
			player,
			table,
		)
	}

	public getHitShapes(): HitObject[] {
		return [this.hitGate!, ...this.hitLines!, ...this.hitCircles!]
	}

	public getMover(): GateMover {
		return this.hitGate!.getMoverObject()
	}

	public getState(): GateState {
		return this.state
	}

	public getApi(): GateApi {
		return this.api!
	}

	public getUpdater(): GateUpdater {
		return this.updater
	}

	public getEventNames(): string[] {
		return ['Hit', 'Init', 'LimitBOS', 'LimitEOS', 'Timer']
	}
}
