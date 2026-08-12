// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import type { IRenderApi } from '../../render/irender-api.js'
import { ItemUpdater } from '../item-updater.js'
import type { Table } from '../table/table.js'
import type { GateData } from './gate-data.js'
import type { GateState } from './gate-state.js'

/** Gate updater — bracket, wire rotation and material. @see https://github.com/vpinball/vpinball/blob/master/gate.cpp */
export class GateUpdater extends ItemUpdater<GateState> {
	constructor(
		private readonly data: GateData,
		state: GateState,
	) {
		super(state)
	}

	public applyState<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: GateState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): void {
		Object.assign(this.state, state)
		this.applyVisibility(obj, state, renderApi)
		this.applyMaterial(obj, state.material, undefined, renderApi, table)
		if (state.showBracket !== undefined)
			renderApi.applyVisibility(state.showBracket, renderApi.findInGroup(obj, `gate.bracket-${state.name}`))
		if (state.angle !== undefined) {
			const scaleZ = table.getScaleZ()
			const baseHeight = table.getSurfaceHeight(this.data.szSurface, this.data.center.x, this.data.center.y) * scaleZ
			const posZ = this.data.height * scaleZ + baseHeight
			const angle = this.data.twoWay ? state.angle : -state.angle
			this.applyXRotation(
				obj,
				renderApi,
				this.data.center,
				posZ,
				this.data.rotation,
				angle,
				`gate.wire-${this.state.getName()}`,
			)
		}
	}
}
