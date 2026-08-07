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
import type { HitCircle } from '../../physics/hit-circle.js'
import type { HitObject } from '../../physics/hit-object.js'
import type { LineSeg } from '../../physics/line-seg.js'
import { degToRad } from '../../util/float.js'
import { Matrix3D, Vertex2D } from '../../util/math.js'
import { Item } from '../item.js'
import type { Table } from '../table/table.js'
import { GateApi } from './gate-api.js'
import { GateData } from './gate-data.js'
import type { GateHit } from './gate-hit.js'
import { GateHitGenerator } from './gate-hit-generator.js'
import { GateMeshGenerator } from './gate-mesh-generator.js'
import type { GateMover } from './gate-mover.js'
import { GateState } from './gate-state.js'
import { GateUpdater } from './gate-updater.js'

/** Gate item. @see https://github.com/vpinball/vpinball/blob/master/gate.cpp */
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
		const gate = this.meshGenerator.getMeshes(table)
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
			this.hitLines.length ? this.hitLines[0]! : null,
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
