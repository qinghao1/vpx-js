// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import type { IRenderApi } from '../../render/irender-api.js'
import { Matrix3D } from '../../util/matrix.js'
import { ItemUpdater } from '../item-updater.js'
import type { Table } from '../table/table.js'
import type { BallData } from './ball-data.js'
import type { BallState } from './ball-state.js'

// Ball pose: row-major R*S*T in D3D (ball.cpp:483) → col-major T*R*S*Flip in Three (matrix.ts:299)
// LH (VPX) z up → RH (Three) y up: translation z negated, orientation basis via Flip; scene.rotateX(π/2) maps -z→+y
// antiStretch is viewport-dependent projection correction (ball.cpp:449) — uniform radius intentional for headless
export class BallUpdater extends ItemUpdater<BallState> {
	constructor(
		state: BallState,
		private readonly data: BallData,
	) {
		super(state)
	}

	applyState<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: BallState,
		api: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		_table: Table,
	): void {
		Object.assign(this.state, state)
		const pos = this.state.pos
		const z = this.state.isFrozen ? pos.z - this.data.radius : pos.z
		const m = this.state.orientation.matrix as unknown as number[][]
		const r0 = m[0] as number[]
		const r1 = m[1] as number[]
		const r2 = m[2] as number[]
		const orient = Matrix3D.claim()
		const trans = Matrix3D.claim()
		const mat = Matrix3D.claim()
		try {
			orient.setEach(
				r0[0] as number,
				r1[0] as number,
				r2[0] as number,
				0,
				r0[1] as number,
				r1[1] as number,
				r2[1] as number,
				0,
				r0[2] as number,
				r1[2] as number,
				r2[2] as number,
				0,
				0,
				0,
				0,
				1,
			)
			trans.setTranslation(pos.x, pos.y, -z)
			mat.setScaling(this.data.radius, this.data.radius, this.data.radius)
				.preMultiply(orient)
				.preMultiply(trans)
				.toRightHanded()
			api.applyMatrixToNode(mat, obj)
		} finally {
			Matrix3D.release(orient, trans, mat)
		}
		;(obj as unknown as { updateMatrixWorld?: (f: boolean) => void }).updateMatrixWorld?.(true)
	}
}
