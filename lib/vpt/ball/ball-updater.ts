// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Matrix3D } from '../../math/matrix3d.js'
import type { IRenderApi } from '../../render/irender-api.js'
import { ItemUpdater } from '../item-updater.js'
import type { Table } from '../table/table.js'
import type { BallData } from './ball-data.js'
import type { BallState } from './ball-state.js'

/** Updates ball render state. */
export class BallUpdater extends ItemUpdater<BallState> {
	private readonly data: BallData

	constructor(state: BallState, data: BallData) {
		super(state)
		this.data = data
	}

	public applyState<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: BallState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): void {
		// update local state
		Object.assign(this.state, state)

		const pos: { _x: number; _y: number; _z: number } = this.state.pos as any
		const zHeight = !this.state.isFrozen ? pos._z : pos._z - this.data.radius
		const orientation = Matrix3D.claim().setEach(
			this.state.orientation.matrix[0][0],
			this.state.orientation.matrix[1][0],
			this.state.orientation.matrix[2][0],
			0.0,
			this.state.orientation.matrix[0][1],
			this.state.orientation.matrix[1][1],
			this.state.orientation.matrix[2][1],
			0.0,
			this.state.orientation.matrix[0][2],
			this.state.orientation.matrix[1][2],
			this.state.orientation.matrix[2][2],
			0.0,
			0,
			0,
			0,
			1,
		)
		const trans = Matrix3D.claim().setTranslation(pos._x, pos._y, zHeight)
		const matrix = Matrix3D.claim()
			.setScaling(this.data.radius, this.data.radius, this.data.radius)
			.preMultiply(orientation)
			.multiply(trans)
			.toRightHanded()

		renderApi.applyMatrixToNode(matrix, obj)
		Matrix3D.release(orientation, trans, matrix)
		const anyObj = obj as any
		if (anyObj && typeof anyObj.updateMatrixWorld === 'function') {
			anyObj.updateMatrixWorld(true)
		}
	}
}
