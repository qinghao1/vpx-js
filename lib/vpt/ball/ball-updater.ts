// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { IRenderApi } from '../../render/irender-api.js'
import { Matrix3D } from '../../util/math.js'
import { ItemUpdater } from '../item-updater.js'
import type { Table } from '../table/table.js'
import type { BallData } from './ball-data.js'
import type { BallState } from './ball-state.js'

/** Syncs ball state to render node. @see https://github.com/vpinball/vpinball/blob/master/ball.cpp */
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
		_table: Table,
	): void {
		Object.assign(this.state, state)
		const pos = this.state.pos,
			z = this.state.isFrozen ? pos.z - this.data.radius : pos.z
		const o = this.state.orientation.matrix
		const orient = Matrix3D.claim().setEach(
			o[0]![0]!,
			o[1]![0]!,
			o[2]![0]!,
			0,
			o[0]![1]!,
			o[1]![1]!,
			o[2]![1]!,
			0,
			o[0]![2]!,
			o[1]![2]!,
			o[2]![2]!,
			0,
			0,
			0,
			0,
			1,
		)
		const trans = Matrix3D.claim().setTranslation(pos.x, pos.y, z)
		const m = Matrix3D.claim()
			.setScaling(this.data.radius, this.data.radius, this.data.radius)
			.preMultiply(orient)
			.multiply(trans)
			.toRightHanded()
		renderApi.applyMatrixToNode(m, obj)
		Matrix3D.release(orient, trans, m)
		const maybe = obj as unknown as { updateMatrixWorld?: (f: boolean) => void }
		maybe.updateMatrixWorld?.(true)
	}
}
