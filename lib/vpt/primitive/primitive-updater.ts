// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { degToRad } from '../../math/float.js'
import { Matrix3D } from '../../math/matrix3d.js'
import type { IRenderApi } from '../../render/irender-api.js'
import { ItemUpdater } from '../item-updater.js'
import type { Table } from '../table/table.js'
import type { PrimitiveData } from './primitive-data.js'
import type { PrimitiveState } from './primitive-state.js'

export class PrimitiveUpdater extends ItemUpdater<PrimitiveState> {
	private readonly data: PrimitiveData

	constructor(data: PrimitiveData, state: PrimitiveState) {
		super(state)
		this.data = data
	}

	public applyState<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: PrimitiveState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): void {
		Object.assign(this.state, state)

		this.applyVisibility(obj, state, renderApi)
		this.applyMaterial(obj, state.material, state.map, renderApi, table) // TODO normal map

		if (state.position || state.size || state.rotation || state.translation || state.objectRotation) {
			this.applyTransformation(obj, renderApi, table)
		}
	}

	private applyTransformation<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		table: Table,
	): void {
		const matToOrigin = Matrix3D.claim().setTranslation(
			-this.data.position.x,
			-this.data.position.y,
			this.data.position.z,
		)
		const matFromOrigin = Matrix3D.claim().setTranslation(
			this.data.position.x,
			this.data.position.y,
			-this.data.position.z,
		)

		// scale matrix
		const scaleMatrix = Matrix3D.claim().setScaling(
			(this.state.size as any)._x / this.data.size.x,
			(this.state.size as any)._y / this.data.size.y,
			(this.state.size as any)._z / this.data.size.z,
		)
		const scaleMatrixTable = Matrix3D.claim().setScaling(1.0, 1.0, table.getScaleZ())

		// translation matrix
		const transMatrix = Matrix3D.claim().setTranslation(
			-(this.data.position.x - (this.state.position as any)._x),
			-(this.data.position.y - (this.state.position as any)._y),
			this.data.position.z - (this.state.position as any)._z,
		)

		// translation + rotation matrix
		const rotTransMatrix = Matrix3D.claim().setTranslation(
			-(this.data.rotAndTra[3] - (this.state.translation as any)._x), // t
			-(this.data.rotAndTra[4] - (this.state.translation as any)._y), // z
			this.data.rotAndTra[5] - (this.state.translation as any)._z, // u
		)

		const tempMatrix = Matrix3D.claim()
		tempMatrix.rotateZMatrix(degToRad(-(this.data.rotAndTra[2] - (this.state.rotation as any)._z))) // r
		rotTransMatrix.multiply(tempMatrix)
		tempMatrix.rotateYMatrix(degToRad(this.data.rotAndTra[1] - (this.state.rotation as any)._y)) // e
		rotTransMatrix.multiply(tempMatrix)
		tempMatrix.rotateXMatrix(degToRad(this.data.rotAndTra[0] - (this.state.rotation as any)._x)) // w
		rotTransMatrix.multiply(tempMatrix)

		tempMatrix.rotateZMatrix(degToRad(-(this.data.rotAndTra[8] - (this.state.objectRotation as any)._z))) // i
		rotTransMatrix.multiply(tempMatrix)
		tempMatrix.rotateYMatrix(degToRad(this.data.rotAndTra[7] - (this.state.objectRotation as any)._y)) // o
		rotTransMatrix.multiply(tempMatrix)
		tempMatrix.rotateXMatrix(degToRad(this.data.rotAndTra[6] - (this.state.objectRotation as any)._x)) // p
		rotTransMatrix.multiply(tempMatrix)

		const matrix = matToOrigin
			.multiply(scaleMatrix)
			.multiply(rotTransMatrix)
			.multiply(transMatrix)
			.multiply(scaleMatrixTable)
			.multiply(matFromOrigin)

		renderApi.applyMatrixToNode(matrix, obj)
		Matrix3D.release(matToOrigin, matFromOrigin, scaleMatrix, transMatrix, rotTransMatrix, tempMatrix) // matrix and matToOrigin are the same instance
	}
}
