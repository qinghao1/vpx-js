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
import { Item } from '../item.js'
import type { Table } from '../table/table.js'
import { SurfaceApi } from './surface-api.js'
import { SurfaceData } from './surface-data.js'
import { SurfaceHitGenerator } from './surface-hit-generator.js'
import { SurfaceMeshGenerator } from './surface-mesh-generator.js'
import { SurfaceState } from './surface-state.js'
import { SurfaceUpdater } from './surface-updater.js'

/** Surface item. @see https://github.com/vpinball/vpinball/blob/master/surface.cpp */
export class Surface
	extends Item<SurfaceData>
	implements IRenderable<SurfaceState>, IHittable, IScriptable<SurfaceApi>
{
	private readonly state: SurfaceState
	private readonly meshGenerator: SurfaceMeshGenerator
	private readonly hitGenerator: SurfaceHitGenerator
	private readonly updater: SurfaceUpdater
	private hits: HitObject[] = []
	private api?: SurfaceApi

	get heightTop() {
		return this.data.heightTop
	}
	get image() {
		return this.data.szImage
	}

	public static async fromStorage(storage: Storage, itemName: string): Promise<Surface> {
		const data = await SurfaceData.fromStorage(storage, itemName)
		return new Surface(data)
	}

	public constructor(data: SurfaceData) {
		super(data)
		this.state = SurfaceState.claim(
			data.getName(),
			false,
			data.isTopBottomVisible,
			data.szTopMaterial,
			data.szImage,
			data.isSideVisible,
			data.szSideMaterial,
			data.szSideImage,
		)
		this.meshGenerator = new SurfaceMeshGenerator()
		this.hitGenerator = new SurfaceHitGenerator(this, data)
		this.updater = new SurfaceUpdater(this.state, this.data)
	}

	public isCollidable(): boolean {
		return this.data.isCollidable
	}

	public isTransparent(table: Table): boolean {
		let result = false
		if (this.data.isSideVisible) {
			const sideMaterial = table.getMaterial(this.data.szSideMaterial)
			result = !sideMaterial || (sideMaterial.isOpacityActive && sideMaterial.opacity < 0.999)
		}
		if (this.data.isTopBottomVisible) {
			const topMaterial = table.getMaterial(this.data.szTopMaterial)
			result = result || !topMaterial || (topMaterial.isOpacityActive && topMaterial.opacity < 0.999)
		}
		return result
	}

	public getMeshes<GEOMETRY>(table: Table): Meshes<GEOMETRY> {
		const meshes: Meshes<GEOMETRY> = {}
		const surface = this.meshGenerator.generateMeshes(this.data, table)
		const topMat = table.getMaterial(this.data.szTopMaterial)
		const sideMat = table.getMaterial(this.data.szSideMaterial)
		const topTransparent = !topMat || (topMat.isOpacityActive && topMat.opacity < 0.999)
		const sideTransparent = !sideMat || (sideMat.isOpacityActive && sideMat.opacity < 0.999)
		if (surface.top) {
			meshes.top = {
				isVisible: this.data.isTopBottomVisible,
				mesh: surface.top.transform(Matrix3D.RIGHT_HANDED),
				map: table.getTexture(this.data.szImage),
				material: table.getMaterial(this.data.szTopMaterial),
				isTransparent: topTransparent,
			}
		}
		if (surface.side) {
			meshes.side = {
				isVisible: this.data.isSideVisible,
				mesh: surface.side.transform(Matrix3D.RIGHT_HANDED),
				map: table.getTexture(this.data.szSideImage),
				material: table.getMaterial(this.data.szSideMaterial),
				isTransparent: sideTransparent,
			}
		}
		return meshes
	}

	public setupPlayer(player: Player, table: Table): void {
		this.events = new EventProxy(this)
		this.hits = this.hitGenerator.generateHitObjects(this.events, player.getPhysics(), table)
		this.drops = this.data.isCollidable ? this.hits : []
		this.api = new SurfaceApi(this.state, this.data, this.hits, this.hitGenerator, this.events, player, table)
	}

	public getApi(): SurfaceApi {
		return this.api!
	}

	public getState(): SurfaceState {
		return this.state
	}

	public getUpdater(): SurfaceUpdater {
		return this.updater
	}

	public getHitShapes(): HitObject[] {
		return this.hits
	}

	public getEventProxy(): EventProxy {
		return this.events!
	}

	public getEventNames(): string[] {
		return ['Init', 'Hit', 'Slingshot', 'Timer']
	}
}
