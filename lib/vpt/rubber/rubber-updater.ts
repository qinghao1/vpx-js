// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { degToRad } from '../../math/float.js'
import { Matrix3D } from '../../math/matrix3d.js'
import type { Vertex3D } from '../../math/vertex3d.js'
import type { IRenderApi } from '../../render/irender-api.js'
import { ItemUpdater } from '../item-updater.js'
import type { Table } from '../table/table.js'
import type { RubberData } from './rubber-data.js'
import type { RubberState } from './rubber-state.js'

export /** RubberUpdater. */
class RubberUpdater extends ItemUpdater<RubberState> {
	private readonly data: RubberData

	private readonly middlePoint: Vertex3D

	constructor(data: RubberData, state: RubberState, middlePoint: Vertex3D) {
		super(state)
		this.data = data
		this.middlePoint = middlePoint
	}

	public applyState<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: RubberState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): void {
		// update local state
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
		const diffRotX = this.data.rotX - this.state.rotX
		const diffRotY = this.data.rotY - this.state.rotY
		const diffRotZ = -(this.data.rotZ - this.state.rotZ)

		const rotMatrix = Matrix3D.claim()
		const tempMat = Matrix3D.claim()
		rotMatrix.rotateZMatrix(degToRad(diffRotZ))
		tempMat.rotateYMatrix(degToRad(diffRotY))
		rotMatrix.multiply(tempMat)
		tempMat.rotateXMatrix(degToRad(diffRotX))
		rotMatrix.multiply(tempMat)

		const matrix = Matrix3D.claim()
		tempMat.setTranslation(-this.middlePoint.x, -this.middlePoint.y, this.data.height + table.getTableHeight())
		matrix.multiply(tempMat, rotMatrix)
		tempMat.setTranslation(this.middlePoint.x, this.middlePoint.y, -this.state.height - table.getTableHeight())
		matrix.multiply(tempMat)

		renderApi.applyMatrixToNode(matrix, obj)
		Matrix3D.release(rotMatrix, tempMat, matrix)
	}
}
