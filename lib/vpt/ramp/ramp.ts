// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EventProxy } from '../../game/event-proxy.js'
import type { IHittable } from '../../game/ihittable.js'
import type { IRenderable, Meshes } from '../../game/irenderable.js'
import type { IScriptable } from '../../game/iscriptable.js'
import type { Player } from '../../game/player.js'
import type { Storage } from '../../io/ole-doc.js'
import type { HitObject } from '../../physics/hit-object.js'
import { Vertex2D } from '../../util/vector.js'
import { Item } from '../item.js'
import { Mesh } from '../mesh.js'
import type { Table } from '../table/table.js'
import { RampApi } from './ramp-api.js'
import { RampData } from './ramp-data.js'
import { RampHitGenerator } from './ramp-hit-generator.js'
import { RampMeshGenerator } from './ramp-mesh-generator.js'
import { RampState } from './ramp-state.js'
import { RampUpdater } from './ramp-updater.js'

/** Ramp item. @see https://github.com/vpinball/vpinball/blob/master/ramp.cpp */
export class Ramp extends Item<RampData> implements IRenderable<RampState>, IHittable, IScriptable<RampApi> {
	private readonly meshGenerator: RampMeshGenerator
	private readonly hitGenerator: RampHitGenerator

	private readonly state: RampState
	private readonly updater: RampUpdater
	private hits?: HitObject[]
	private api?: RampApi

	public static async fromStorage(storage: Storage, itemName: string): Promise<Ramp> {
		const data = await RampData.fromStorage(storage, itemName)
		return new Ramp(data)
	}

	public constructor(data: RampData) {
		super(data)
		this.state = RampState.claim(
			data.getName(),
			data.heightBottom,
			data.heightTop,
			data.widthBottom,
			data.widthTop,
			data.leftWallHeight,
			data.rightWallHeight,
			data.leftWallHeightVisible,
			data.rightWallHeightVisible,
			data.rampType,
			data.szMaterial,
			data.szImage,
			data.imageAlignment,
			data.imageWalls,
			data.depthBias,
			data.isVisible && data.widthTop > 0 && data.widthBottom > 0,
		)
		this.meshGenerator = new RampMeshGenerator(data, this.state)
		this.hitGenerator = new RampHitGenerator(data, this.meshGenerator)
		this.updater = new RampUpdater(this.state, this.meshGenerator)
	}

	public isCollidable(): boolean {
		return this.data.isCollidable
	}

	public isTransparent(table: Table): boolean {
		const material = table.getMaterial(this.data.szMaterial)
		return !material || material.isOpacityActive
	}

	public setupPlayer(player: Player, table: Table): void {
		this.events = new EventProxy(this)
		this.hits = this.hitGenerator.generateHitObjects(table, this.events)
		this.api = new RampApi(this.state, this.hits, this.data, this.events, player, table)
	}

	public getApi(): RampApi {
		return this.api!
	}

	public getState(): RampState {
		return this.state
	}

	public getUpdater(): RampUpdater {
		return this.updater
	}

	public getEventNames(): string[] {
		return ['Init']
	}

	public getHitShapes(): HitObject[] {
		return this.hits!
	}

	public getMeshes<GEOMETRY>(table: Table): Meshes<GEOMETRY> {
		const isTransparent = this.isTransparent(table)
		return this.meshGenerator.getMeshes(isTransparent, table)
	}

	public getSurfaceHeight(x: number, y: number, table: Table) {
		const vVertex = this.meshGenerator.getCentralCurve(table)
		let iSeg: number
		let vOut: Vertex2D
		;[vOut, iSeg] = Mesh.closestPointOnPolygon(vVertex, new Vertex2D(x, y), false)
		if (iSeg === -1) return 0
		let totalLength = 0
		let startLength = 0
		const cVertex = vVertex.length
		for (let i2 = 1; i2 < cVertex; i2++) {
			const vDx = vVertex[i2]?.x - vVertex[i2 - 1]?.x
			const vDy = vVertex[i2]?.y - vVertex[i2 - 1]?.y
			const vLen = Math.sqrt(vDx * vDx + vDy * vDy)
			if (i2 <= iSeg) startLength = startLength + vLen
			totalLength = totalLength + vLen
		}
		const dx = vOut.x - vVertex[iSeg]?.x
		const dy = vOut.y - vVertex[iSeg]?.y
		const len = Math.sqrt(dx * dx + dy * dy)
		startLength = startLength + len
		const topHeight = this.data.heightTop + table.getTableHeight()
		const bottomHeight = this.data.heightBottom + table.getTableHeight()
		return vVertex[iSeg]?.z + (startLength / totalLength) * (topHeight - bottomHeight) + bottomHeight
	}
}
