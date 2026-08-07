// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { degToRad } from '../../math/float.js'
import { Matrix3D } from '../../math/matrix3d.js'
import type { IRenderApi } from '../../render/irender-api.js'
import { ItemUpdater } from '../item-updater.js'
import type { Table } from '../table/table.js'
import type { PrimitiveData } from './primitive-data.js'
import type { PrimitiveState } from './primitive-state.js'

/** Primitive updater — syncs state to render node. */
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
		this.applyMaterial(obj, state.material, state.map, renderApi, table)

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
		const scaleMatrix = Matrix3D.claim().setScaling(
			(this.state.size?.x ?? this.data.size.x) / this.data.size.x,
			(this.state.size?.y ?? this.data.size.y) / this.data.size.y,
			(this.state.size?.z ?? this.data.size.z) / this.data.size.z,
		)
		const scaleMatrixTable = Matrix3D.claim().setScaling(1, 1, table.getScaleZ())
		const transMatrix = Matrix3D.claim().setTranslation(
			-(this.data.position.x - (this.state.position?.x ?? this.data.position.x)),
			-(this.data.position.y - (this.state.position?.y ?? this.data.position.y)),
			this.data.position.z - (this.state.position?.z ?? this.data.position.z),
		)
		const rotTransMatrix = Matrix3D.claim().setTranslation(
			-(this.data.rotAndTra[3] - (this.state.translation?.x ?? this.data.rotAndTra[3])),
			-(this.data.rotAndTra[4] - (this.state.translation?.y ?? this.data.rotAndTra[4])),
			this.data.rotAndTra[5] - (this.state.translation?.z ?? this.data.rotAndTra[5]),
		)

		const tmp = Matrix3D.claim()
		tmp.rotateZMatrix(degToRad(-(this.data.rotAndTra[2] - (this.state.rotation?.z ?? this.data.rotAndTra[2]))))
		rotTransMatrix.multiply(tmp)
		tmp.rotateYMatrix(degToRad(this.data.rotAndTra[1] - (this.state.rotation?.y ?? this.data.rotAndTra[1])))
		rotTransMatrix.multiply(tmp)
		tmp.rotateXMatrix(degToRad(this.data.rotAndTra[0] - (this.state.rotation?.x ?? this.data.rotAndTra[0])))
		rotTransMatrix.multiply(tmp)

		tmp.rotateZMatrix(degToRad(-(this.data.rotAndTra[8] - (this.state.objectRotation?.z ?? this.data.rotAndTra[8]))))
		rotTransMatrix.multiply(tmp)
		tmp.rotateYMatrix(degToRad(this.data.rotAndTra[7] - (this.state.objectRotation?.y ?? this.data.rotAndTra[7])))
		rotTransMatrix.multiply(tmp)
		tmp.rotateXMatrix(degToRad(this.data.rotAndTra[6] - (this.state.objectRotation?.x ?? this.data.rotAndTra[6])))
		rotTransMatrix.multiply(tmp)

		const matrix = matToOrigin
			.multiply(scaleMatrix)
			.multiply(rotTransMatrix)
			.multiply(transMatrix)
			.multiply(scaleMatrixTable)
			.multiply(matFromOrigin)

		renderApi.applyMatrixToNode(matrix, obj)
		Matrix3D.release(matToOrigin, matFromOrigin, scaleMatrix, transMatrix, rotTransMatrix, tmp)
	}
}
