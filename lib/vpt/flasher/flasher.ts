// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { EventProxy } from '../../game/event-proxy.js'
import type { IAnimatable, IAnimation, IRenderable, IScriptable, Meshes } from '../../game/interfaces.js'
import type { Player } from '../../game/player.js'
import type { Storage } from '../../io/ole-doc.js'
import type { IRenderApi } from '../../render/irender-api.js'
import { Item } from '../item.js'
import type { Table, TableGenerateOptions } from '../table/table.js'
import { FlasherAnimation } from './flasher-animation.js'
import { FlasherApi } from './flasher-api.js'
import { FlasherData } from './flasher-data.js'
import { FlasherMeshGenerator } from './flasher-mesh-generator.js'
import { FlasherState } from './flasher-state.js'
import { FlasherUpdater } from './flasher-updater.js'

/** Runtime flasher. */
export class Flasher
	extends Item<FlasherData>
	implements IScriptable<FlasherApi>, IRenderable<FlasherState>, IAnimatable
{
	private api?: FlasherApi
	private readonly state: FlasherState
	private readonly updater: FlasherUpdater
	private readonly meshGenerator = new FlasherMeshGenerator()
	private animation?: FlasherAnimation

	public static async fromStorage(storage: Storage, itemName: string): Promise<Flasher> {
		const data = await FlasherData.fromStorage(storage, itemName)
		return new Flasher(data)
	}

	private constructor(data: FlasherData) {
		super(data)
		this.state = FlasherState.claim(
			data.getName(),
			data.isVisible,
			data.color,
			data.alpha,
			data.rotX,
			data.rotY,
			data.rotZ,
			data.height,
		)
		this.state.imageA = data.szImageA ?? ''
		this.updater = new FlasherUpdater(this.state, this.data)
	}

	public getState(): FlasherState {
		return this.state
	}

	public getUpdater(): FlasherUpdater {
		return this.updater
	}

	public getMeshes<NODE, GEOMETRY, POINT_LIGHT>(
		table: Table,
		_renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		_opts: TableGenerateOptions,
	): Meshes<GEOMETRY> {
		const mesh = this.meshGenerator.generateMesh(this.data, table)
		if (!mesh) return {}
		const meshes: Meshes<GEOMETRY> = {}
		meshes.flasher = {
			isVisible: this.data.isVisible,
			mesh,
			map: this.data.szImageA ? table.getTexture(this.data.szImageA) : undefined,
			addBlend: this.data.addBlend,
			// Tri-state blend mode; absorb renders premultiplied-over downstream.
			// @see FlasherData::AddBlendMode in src/parts/flasher.h
			addBlendMode: this.data.addBlendMode,
			depthBias: this.data.depthBias,
			isTransparent: true,
			depthWrite: false,
		}
		return meshes
	}

	public setupPlayer(player: Player, table: Table): void {
		this.events = new EventProxy(this)
		this.updater.resolveLightmap(table)
		this.animation = new FlasherAnimation(this.data, this.state, () => player.getPhysics().emu)
		this.api = new FlasherApi(this.data, this.events, player, table, this.state)
	}

	public getAnimation(): IAnimation {
		return this.animation!
	}

	public getApi(): FlasherApi {
		return this.api!
	}

	public getEventNames(): string[] {
		return ['Init', 'Timer']
	}
}
