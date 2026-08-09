// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { IRenderApi } from '../../render/irender-api.js'
import { Matrix3D } from '../../util/matrix.js'
import { ItemUpdater } from '../item-updater.js'
import type { Table } from '../table/table.js'
import type { FlipperData } from './flipper-data.js'
import type { FlipperState } from './flipper-state.js'

/** Syncs flipper state to render node. @see https://github.com/vpinball/vpinball/blob/master/flipper.cpp */
export class FlipperUpdater extends ItemUpdater<FlipperState> {
	constructor(
		private readonly data: FlipperData,
		state: FlipperState,
	) {
		super(state)
	}
	public applyState<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: FlipperState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): void {
		Object.assign(this.state, state)
		this.applyVisibility(obj, state, renderApi)
		this.applyMaterial(obj, state.material, state.texture, renderApi, table)
		if (state.center || state.angle !== undefined) this.applyTransformation(obj, renderApi, table)
	}
	private applyTransformation<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): void {
		const center = this.state.center ?? this.data.center
		const dx = center.x - this.data.center.x,
			dy = center.y - this.data.center.y
		const h =
			table.getSurfaceHeight(this.data.szSurface, this.data.center.x, this.data.center.y) * table.getScaleZ()
		const m0 = Matrix3D.claim().setTranslation(-this.data.center.x, -this.data.center.y, h)
		const m1 = Matrix3D.claim().setTranslation(this.data.center.x, this.data.center.y, -h)
		const angle = this.state.angle ?? 0
		const mr = Matrix3D.claim().rotateZMatrix(angle - (this.data.startAngle * Math.PI) / 180)
		const mt = Matrix3D.claim().setTranslation(dx, dy, 0)
		const m = mt.clone().multiply(m1).multiply(mr).multiply(m0)
		renderApi.applyMatrixToNode(m, obj)
		Matrix3D.release(m0, m1, mr, mt, m)
	}
}
