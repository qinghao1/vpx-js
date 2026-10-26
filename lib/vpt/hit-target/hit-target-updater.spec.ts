// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import { spy } from 'sinon'
import sinonChai from 'sinon-chai'
import { TableBuilder } from '../../../test/table-builder.js'
import { TestRenderApi } from '../../../test/test-render-api.js'
import { Player } from '../../game/player.js'
import type { Matrix3D } from '../../math/matrix.js'
import { Vertex3D } from '../../math/vector.js'
import type { Table } from '../table/table.js'
import type { HitTargetState } from './hit-target.js'

chai.use((sinonChai as any).default ?? sinonChai)

class CapturingRenderApi extends TestRenderApi {
	public readonly matrices: Matrix3D[] = []

	public override applyMatrixToNode(matrix: Matrix3D, _node: unknown): void {
		this.matrices.push(matrix.clone())
	}
}

describe('The VPinball hit target updater', () => {
	let table: Table
	let player: Player

	beforeEach(() => {
		table = new TableBuilder().addMaterial('opaque', { isOpacityActive: false }).addHitTarget('target').build()

		// init player
		player = new Player(table).init()
	})

	it('should update visibility', async () => {
		table.hitTargets.target.getApi().Visible = false
		const states = player.popStates()

		expect(states.getState<HitTargetState>('target').isVisible).to.equal(false)
		states.getState<HitTargetState>('target').release()
	})

	it('should apply visibility', async () => {
		const renderApi = new TestRenderApi()
		spy(renderApi, 'applyVisibility')
		table.hitTargets.target
			.getUpdater()
			.applyState(null, { isVisible: true } as HitTargetState, renderApi as any, table)
		expect(renderApi.applyVisibility).to.have.been.calledOnce
	})

	it('should apply the material', async () => {
		const renderApi = new TestRenderApi()
		spy(renderApi, 'applyMaterial')
		table.hitTargets.target
			.getUpdater()
			.applyState(null, { material: 'opaque' } as HitTargetState, renderApi as any, table)
		expect(renderApi.applyMaterial).to.have.been.calledOnce
	})

	it('should apply the transformation', async () => {
		const renderApi = new TestRenderApi()
		spy(renderApi, 'applyMatrixToNode')
		table.hitTargets.target
			.getUpdater()
			.applyState(null, { zOffset: 10 } as HitTargetState, renderApi as any, table)
		expect(renderApi.applyMatrixToNode).to.have.been.calledOnce
	})

	it('should rotate xRotation about the target position pivot', async () => {
		const target = table.hitTargets.target
		const renderApi = new CapturingRenderApi()
		target.getUpdater().applyState(null, { zOffset: 0, xRotation: 90 } as HitTargetState, renderApi as any, table)
		expect(renderApi.matrices).to.have.lengthOf(1)
		const [matrix] = renderApi.matrices
		const p = target.data.position

		// The pivot itself never moves.
		const pivot = new Vertex3D(p.x, p.y, p.z).multiplyMatrix(matrix)
		expect([pivot.x, pivot.y, pivot.z]).to.deep.equal([p.x, p.y, p.z])

		// +90° about X sends +Z to -Y and +Y to +Z (upstream RotX, row-vector).
		const above = new Vertex3D(p.x, p.y, p.z + 10).multiplyMatrix(matrix)
		expect(above.x).to.be.closeTo(p.x, 1e-6)
		expect(above.y).to.be.closeTo(p.y - 10, 1e-6)
		expect(above.z).to.be.closeTo(p.z, 1e-6)
		const front = new Vertex3D(p.x, p.y + 10, p.z).multiplyMatrix(matrix)
		expect(front.x).to.be.closeTo(p.x, 1e-6)
		expect(front.y).to.be.closeTo(p.y, 1e-6)
		expect(front.z).to.be.closeTo(p.z + 10, 1e-6)
		Vertex3D.release(pivot, above, front)
	})
})
