// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import type { IRenderApi } from '../../render/irender-api.js'
import { Matrix3D } from '../../util/math.js'
import { ItemUpdater } from '../item-updater.js'
import type { Table } from '../table/table.js'
import type { BallData } from './ball-data.js'
import type { BallState } from './ball-state.js'

// Ball pose: row-major R*S*T in D3D (ball.cpp:483) → col-major T*R*S*Flip in Three (matrix.ts:299)
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
        const o = this.state.orientation.matrix
        const orient = Matrix3D.claim()
        const trans = Matrix3D.claim()
        const mat = Matrix3D.claim()
        try {
            orient.setEach(
                o[0]![0]!, o[1]![0]!, o[2]![0]!, 0,
                o[0]![1]!, o[1]![1]!, o[2]![1]!, 0,
                o[0]![2]!, o[1]![2]!, o[2]![2]!, 0,
                0, 0, 0, 1,
            )
            trans.setTranslation(pos.x, pos.y, z)
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
