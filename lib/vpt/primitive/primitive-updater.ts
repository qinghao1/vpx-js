// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { IRenderApi } from '../../render/irender-api.js'
import { degToRad } from '../../util/float.js'
import { Matrix3D } from '../../util/math.js'
import { ItemUpdater } from '../item-updater.js'
import type { Table } from '../table/table.js'
import type { PrimitiveData } from './primitive-data.js'
import type { PrimitiveState } from './primitive-state.js'

/** Primitive updater — syncs state to render node. */
export class PrimitiveUpdater extends ItemUpdater<PrimitiveState> {
	constructor(
		private readonly data: PrimitiveData,
		state: PrimitiveState,
	) {
		super(state)
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
		const d = this.data
		const s = this.state
		const toOrigin = Matrix3D.claim().setTranslation(-d.position.x, -d.position.y, d.position.z)
		const fromOrigin = Matrix3D.claim().setTranslation(d.position.x, d.position.y, -d.position.z)
		const scale = Matrix3D.claim().setScaling(
			(s.size?.x ?? d.size.x) / d.size.x,
			(s.size?.y ?? d.size.y) / d.size.y,
			(s.size?.z ?? d.size.z) / d.size.z,
		)
		const scaleZ = Matrix3D.claim().setScaling(1, 1, table.getScaleZ())
		const trans = Matrix3D.claim().setTranslation(
			-(d.position.x - (s.position?.x ?? d.position.x)),
			-(d.position.y - (s.position?.y ?? d.position.y)),
			d.position.z - (s.position?.z ?? d.position.z),
		)
		const rotTrans = Matrix3D.claim()
		rotTrans.rotateXMatrix(degToRad(d.rotAndTra[6] - (s.objectRotation?.x ?? d.rotAndTra[6])))
		const tmp = Matrix3D.claim()
		tmp.rotateYMatrix(degToRad(d.rotAndTra[7] - (s.objectRotation?.y ?? d.rotAndTra[7])))
		rotTrans.multiply(tmp)
		tmp.rotateZMatrix(degToRad(-(d.rotAndTra[8] - (s.objectRotation?.z ?? d.rotAndTra[8]))))
		rotTrans.multiply(tmp)
		tmp.rotateXMatrix(degToRad(d.rotAndTra[0] - (s.rotation?.x ?? d.rotAndTra[0])))
		rotTrans.multiply(tmp)
		tmp.rotateYMatrix(degToRad(d.rotAndTra[1] - (s.rotation?.y ?? d.rotAndTra[1])))
		rotTrans.multiply(tmp)
		tmp.rotateZMatrix(degToRad(-(d.rotAndTra[2] - (s.rotation?.z ?? d.rotAndTra[2]))))
		rotTrans.multiply(tmp)
		tmp.setTranslation(
			-(d.rotAndTra[3] - (s.translation?.x ?? d.rotAndTra[3])),
			-(d.rotAndTra[4] - (s.translation?.y ?? d.rotAndTra[4])),
			d.rotAndTra[5] - (s.translation?.z ?? d.rotAndTra[5]),
		)
		rotTrans.multiply(tmp)
		const m = fromOrigin
			.clone()
			.multiply(scaleZ)
			.multiply(trans)
			.multiply(rotTrans)
			.multiply(scale)
			.multiply(toOrigin)
		renderApi.applyMatrixToNode(m, obj)
		Matrix3D.release(toOrigin, fromOrigin, scale, trans, rotTrans, tmp, scaleZ, m)
	}
}
