// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { IRenderApi } from '../../render/irender-api.js'
import { Matrix3D } from '../../util/math.js'
import { ItemUpdater } from '../item-updater.js'
import type { Table } from '../table/table.js'
import type { SurfaceData } from './surface-data.js'
import type { SurfaceState } from './surface-state.js'

/** SurfaceUpdater. */
export class SurfaceUpdater extends ItemUpdater<SurfaceState> {
	private readonly data: SurfaceData

	constructor(state: SurfaceState, data: SurfaceData) {
		super(state)
		this.data = data
	}

	public applyState<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: SurfaceState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): void {
		this.applyDropState(obj, state, renderApi)
		this.applySideState(obj, state, renderApi, table)
		this.applyTopState(obj, state, renderApi, table)
	}

	private applyDropState<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: SurfaceState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
	): void {
		if (state.isDropped !== undefined) {
			const matrix = Matrix3D.claim()
			if (state.isDropped) {
				matrix.setTranslation(0, 0, this.data.heightTop - 0.01)
			}
			renderApi.applyMatrixToNode(matrix, obj)
			Matrix3D.release(matrix)
		}
	}

	private applyTopState<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: SurfaceState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): void {
		const topObj = renderApi.findInGroup(obj, `surface.top-${this.state.getName()}`)
		if (state.isTopVisible !== undefined) {
			renderApi.applyVisibility(state.isTopVisible, topObj)
		}
		this.applyMaterial(topObj, state.topMaterial, state.topTexture, renderApi, table)
	}

	private applySideState<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: SurfaceState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): void {
		const sideObj = renderApi.findInGroup(obj, `surface.side-${this.state.getName()}`)
		if (state.isSideVisible !== undefined) {
			renderApi.applyVisibility(state.isSideVisible, sideObj)
		}
		this.applyMaterial(sideObj, state.sideMaterial, state.sideTexture, renderApi, table)
	}
}
