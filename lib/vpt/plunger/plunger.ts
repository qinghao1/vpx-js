// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EventProxy } from '../../game/event-proxy.js'
import type { IHittable } from '../../game/ihittable.js'
import type { IMovable } from '../../game/imovable.js'
import type { IPlayable } from '../../game/iplayable.js'
import type { IRenderable, Meshes } from '../../game/irenderable.js'
import type { IScriptable } from '../../game/iscriptable.js'
import type { IBallCreationPosition, Player } from '../../game/player.js'
import type { PlayerPhysics } from '../../game/player-physics.js'
import type { Storage } from '../../io/ole-doc.js'
import type { HitObject } from '../../physics/hit-object.js'
import { Vertex3D } from '../../util/math.js'
import type { Ball } from '../ball/ball.js'
import { Item } from '../item.js'
import type { Table } from '../table/table.js'
import { PlungerApi } from './plunger-api.js'
import { PlungerData } from './plunger-data.js'
import { PlungerHit } from './plunger-hit.js'
import { PlungerMeshGenerator } from './plunger-mesh-generator.js'
import type { PlungerMover } from './plunger-mover.js'
import { PlungerState } from './plunger-state.js'
import { PlungerUpdater } from './plunger-updater.js'

/** Plunger item. @see https://github.com/vpinball/vpinball/blob/master/plunger.cpp */
export class Plunger
	extends Item<PlungerData>
	implements IRenderable<PlungerState>, IPlayable, IMovable, IHittable, IBallCreationPosition, IScriptable<PlungerApi>
{
	public static PLUNGER_HEIGHT = 50.0

	private readonly meshGenerator: PlungerMeshGenerator
	private readonly state: PlungerState
	private readonly updater: PlungerUpdater
	private api?: PlungerApi
	private hit?: PlungerHit

	public static async fromStorage(storage: Storage, itemName: string): Promise<Plunger> {
		const data = await PlungerData.fromStorage(storage, itemName)
		return new Plunger(itemName, data)
	}

	public constructor(itemName: string, data: PlungerData) {
		super(data)
		this.meshGenerator = new PlungerMeshGenerator(data)
		this.state = PlungerState.claim(this.getName(), 0)
		this.updater = new PlungerUpdater(this.state, this.meshGenerator)
	}

	public getState(): PlungerState {
		return this.state!
	}

	public getMeshes<GEOMETRY>(table: Table): Meshes<GEOMETRY> {
		const plunger = this.meshGenerator.generateMeshes(0, table)
		const meshes: Meshes<GEOMETRY> = {}
		const material = table.getMaterial(this.data.szMaterial)
		const map = table.getTexture(this.data.szImage)

		if (plunger.rod) {
			meshes.rod = { isVisible: this.data.isVisible, mesh: plunger.rod, material, map }
		}
		if (plunger.spring) {
			meshes.spring = { isVisible: this.data.isVisible, mesh: plunger.spring, material, map }
		}
		if (plunger.flat) {
			meshes.flat = { isVisible: this.data.isVisible, mesh: plunger.flat, material, map }
		}
		return meshes
	}

	public isCollidable(): boolean {
		return true
	}

	public setupPlayer(player: Player, table: Table): void {
		this.events = new EventProxy(this)
		this.hit = new PlungerHit(this.data, this.state, this.events, this.meshGenerator.cFrames, player, table)
		this.api = new PlungerApi(this.data, this.hit, this.events, this, player, table)
	}

	public getApi(): PlungerApi {
		return this.api!
	}

	public getMover(): PlungerMover {
		return this.hit!.getMoverObject()
	}

	public getHitShapes(): HitObject[] {
		return [this.hit!]
	}

	public getEventProxy(): EventProxy {
		return this.events!
	}

	public pullBack(): void {
		this.getMover().pullBack(this.data.speedPull)
	}

	public fire(): void {
		// check for an auto plunger
		if (this.data.autoPlunger) {
			// Auto Plunger - this models a "Launch Ball" button or a
			// ROM-controlled launcher, rather than a player-operated
			// spring plunger.  In a physical machine, this would be
			// implemented as a solenoid kicker, so the amount of force
			// is constant (modulo some mechanical randomness).  Simulate
			// this by triggering a release from the maximum retracted
			// position.
			this.getMover().fire(1.0)
		} else {
			// Regular plunger - trigger a release from the current
			// position, using the keyboard firing strength.
			this.getMover().fire()
		}
	}

	public getUpdater(): PlungerUpdater {
		return this.updater
	}

	public getBallCreationPosition(table: Table): Vertex3D {
		const x = (this.getMover().x + this.getMover().x2) * 0.5
		const y = this.getMover().pos - (25.0 + 0.01) //!! assumes ball radius 25
		const height = table.getSurfaceHeight(this.data.szSurface, x, y)
		return new Vertex3D(x, y, height)
	}

	public getBallCreationVelocity(table: Table): Vertex3D {
		return new Vertex3D(0, 0, 0)
	}

	public onBallCreated(physics: PlayerPhysics, ball: Ball): void {
		// nothing to be done
	}

	public getEventNames(): string[] {
		return ['Init', 'Timer', 'LimitEOS', 'LimitBOS']
	}
}

export interface PlungerConfig {
	x: number
	y: number
	x2: number
	zHeight: number
	frameTop: number
	frameBottom: number
	cFrames: number
}
