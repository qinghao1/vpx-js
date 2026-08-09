// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { IRenderApi } from '../../render/irender-api.js'
import { degToRad } from '../../util/float.js'
import type { Vertex3D } from '../../util/vector.js'
import { Matrix3D } from '../../util/matrix.js'
import { ItemUpdater } from '../item-updater.js'
import type { Table } from '../table/table.js'
import type { RubberData } from './rubber-data.js'
import type { RubberState } from './rubber-state.js'

/** Rubber updater — height and rotation. */
export class RubberUpdater extends ItemUpdater<RubberState> {
	constructor(
		private readonly data: RubberData,
		state: RubberState,
		private readonly middlePoint: Vertex3D,
	) {
		super(state)
	}

	public applyState<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: RubberState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): void {
		Object.assign(this.state, state)
		this.applyVisibility(obj, state, renderApi)
		this.applyMaterial(obj, state.material, state.texture, renderApi, table)
		if (
			state.rotX !== undefined ||
			state.rotY !== undefined ||
			state.rotZ !== undefined ||
			state.height !== undefined
		) {
			this.applyTransformation(obj, renderApi, table)
		}
	}

	private applyTransformation<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): void {
		const dX = this.data.rotX - this.state.rotX
		const dY = this.data.rotY - this.state.rotY
		const dZ = -(this.data.rotZ - this.state.rotZ)
		const rot = Matrix3D.claim().rotateXMatrix(degToRad(dX))
		const tmp = Matrix3D.claim()
		tmp.rotateYMatrix(degToRad(dY))
		rot.multiply(tmp)
		tmp.rotateZMatrix(degToRad(dZ))
		rot.multiply(tmp)
		const m = Matrix3D.claim()
		tmp.setTranslation(this.middlePoint.x, this.middlePoint.y, -this.state.height - table.getTableHeight())
		m.multiply(tmp)
		tmp.setTranslation(-this.middlePoint.x, -this.middlePoint.y, this.data.height + table.getTableHeight())
		const rotTrans = Matrix3D.claim()
		rotTrans.multiplyMatrices(rot, tmp)
		m.multiply(rotTrans)
		renderApi.applyMatrixToNode(m, obj)
		Matrix3D.release(rot, tmp, m, rotTrans)
	}
}
