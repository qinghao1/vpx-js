// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EventProxy } from '../../game/event-proxy.js'
import type { IHittable } from '../../game/ihittable.js'
import type { IRenderable, Meshes } from '../../game/irenderable.js'
import type { IScriptable } from '../../game/iscriptable.js'
import type { Player } from '../../game/player.js'
import type { Storage } from '../../io/ole-doc.js'
import type { HitObject } from '../../physics/hit-object.js'
import { Matrix3D } from '../../util/matrix.js'
import type { Ball } from '../ball/ball.js'
import { Item } from '../item.js'
import { Mesh } from '../mesh.js'
import type { Table } from '../table/table.js'
import { PrimitiveApi } from './primitive-api.js'
import { PrimitiveData } from './primitive-data.js'
import { PrimitiveHitGenerator } from './primitive-hit-generator.js'
import { PrimitiveMeshGenerator } from './primitive-mesh-generator.js'
import { PrimitiveState } from './primitive-state.js'
import { PrimitiveUpdater } from './primitive-updater.js'

/** Primitive item. @see https://github.com/vpinball/vpinball/blob/master/primitive.cpp */
export class Primitive
	extends Item<PrimitiveData>
	implements IRenderable<PrimitiveState>, IHittable, IScriptable<PrimitiveApi>
{
	private readonly state: PrimitiveState
	private readonly meshGenerator: PrimitiveMeshGenerator
	private readonly hitGenerator: PrimitiveHitGenerator
	private readonly updater: PrimitiveUpdater
	private mesh?: Mesh
	private api?: PrimitiveApi
	private hits?: HitObject[]

	public static async fromStorage(storage: Storage, itemName: string, loadMeshes: boolean): Promise<Primitive> {
		const data = await PrimitiveData.fromStorage(storage, itemName, loadMeshes)
		return new Primitive(data)
	}

	public constructor(data: PrimitiveData) {
		super(data)
		this.state = PrimitiveState.claimFrom(
			data.getName(),
			data.position.clone(true),
			data.size.clone(true),
			[...data.rotAndTra],
			data.szMaterial!,
			data.szImage,
			data.szNormalMap,
			data.isVisible,
			data.color,
			data.disableLightingTop,
			data.disableLightingBelow,
		)
		this.updater = new PrimitiveUpdater(data, this.state)
		this.meshGenerator = new PrimitiveMeshGenerator(data)
		this.hitGenerator = new PrimitiveHitGenerator(data)
	}

	public isTransparent(table: Table): boolean {
		const material = table.getMaterial(this.data.szMaterial)
		return !material || (material.isOpacityActive && material.opacity < 0.999)
	}

	public isCollidable(): boolean {
		return this.data.isCollidable
	}

	public getMeshes<GEOMETRY>(table: Table): Meshes<GEOMETRY> {
		const isTransparent = this.isTransparent(table)
		return {
			primitive: {
				isVisible: this.data.isVisible,
				mesh: this.getMesh(table).clone().transform(Matrix3D.RIGHT_HANDED),
				map: table.getTexture(this.data.szImage),
				normalMap: table.getTexture(this.data.szNormalMap),
				material: table.getMaterial(this.data.szMaterial),
				isTransparent,
			},
		}
	}

	public clearMesh() {
		this.data.mesh = new Mesh()
	}

	private getMesh(table: Table): Mesh {
		if (!this.mesh) {
			this.mesh = this.meshGenerator.getMesh(table)
		}
		return this.mesh
	}

	public setupPlayer(player: Player, table: Table): void {
		this.events = new EventProxy(this)
		this.events.onCollision = (obj: HitObject, ball: Ball, dot: number) => {
			this.events!.currentHitThreshold = dot
			obj.fireHitEvent(ball)
		}
		this.hits = this.hitGenerator.generateHitObjects(this.getMesh(table), this.events, table)
		this.api = new PrimitiveApi(this, this.state, this.data, this.hits!, this.events, player, table)
	}

	public getApi(): PrimitiveApi {
		return this.api!
	}

	public getState(): PrimitiveState {
		return this.state
	}

	public getUpdater(): PrimitiveUpdater {
		return this.updater
	}

	public getHitShapes(): HitObject[] {
		return this.hits!
	}

	public setSides(num: number): void {
		this.data.sides = num
	}

	public setCollidable(isCollidable: boolean) {
		if (this.hits?.length > 0 && this.hits?.[0].isEnabled !== isCollidable) {
			for (const hit of this.hits!) {
				// !! costly
				hit.isEnabled = isCollidable //copy to hit-testing on entities composing the object
			}
		}
	}

	public getEventNames(): string[] {
		return ['Hit', 'Init']
	}
}
