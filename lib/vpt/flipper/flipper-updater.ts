// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { degToRad } from '../../math/float.js'
import { Matrix3D } from '../../math/matrix3d.js'
import type { IRenderApi } from '../../render/irender-api.js'
import { ItemUpdater } from '../item-updater.js'
import type { Table } from '../table/table.js'
import type { FlipperData } from './flipper-data.js'
import type { FlipperState } from './flipper-state.js'

export /** FlipperUpdater. */
class FlipperUpdater extends ItemUpdater<FlipperState> {
	private readonly data: FlipperData

	constructor(data: FlipperData, state: FlipperState) {
		super(state)
		this.data = data
	}

	public applyState<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: FlipperState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): void {
		// update local state
		Object.assign(this.state, state)

		this.applyVisibility(obj, state, renderApi)
		this.applyMaterial(obj, state.material, state.texture, renderApi, table)
		// transformations
		if (state.center || state.angle) {
			this.applyTransformation(obj, renderApi, table)
		}
	}

	private applyTransformation<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): void {
		const diffX = (this.state.center as any)._x - this.data.center.x
		const diffY = (this.state.center as any)._y - this.data.center.y

		const height =
			table.getSurfaceHeight(this.data.szSurface, this.data.center.x, this.data.center.y) * table.getScaleZ()

		const matToOrigin = Matrix3D.claim().setTranslation(-this.data.center.x, -this.data.center.y, height)
		const matFromOrigin = Matrix3D.claim().setTranslation(this.data.center.x, this.data.center.y, -height)
		const matRotate = Matrix3D.claim().rotateZMatrix(this.state.angle - degToRad(this.data.startAngle))
		const matTrans = Matrix3D.claim().setTranslation(diffX, diffY, 0)
		const matrix = matToOrigin.multiply(matRotate).multiply(matFromOrigin).multiply(matTrans)

		renderApi.applyMatrixToNode(matrix, obj)
		Matrix3D.release(matToOrigin, matFromOrigin, matRotate, matTrans) // matrix and matToOrigin are the same instance
	}
}
