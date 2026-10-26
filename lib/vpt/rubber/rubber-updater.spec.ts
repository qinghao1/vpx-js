// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import { spy } from 'sinon'
import sinonChai from 'sinon-chai'
import { Matrix4, Vector3 } from 'three'
import { TableBuilder } from '../../../test/table-builder.js'
import { TestRenderApi } from '../../../test/test-render-api.js'
import { Player } from '../../game/player.js'
import { Matrix3D } from '../../math/matrix.js'
import type { Table } from '../table/table.js'
import type { RubberState } from './rubber.js'

chai.use((sinonChai as any).default ?? sinonChai)

class CapturingRenderApi extends TestRenderApi {
	public readonly matrices: Matrix3D[] = []

	public override applyMatrixToNode(matrix: Matrix3D, _node: unknown): void {
		this.matrices.push(matrix.clone())
	}
}

describe('The VPinball rubber updater', () => {
	let table: Table
	let player: Player

	beforeEach(() => {
		table = new TableBuilder()
			.addMaterial('opaque', { isOpacityActive: false })
			.addRubber('r1', { staticRendering: false })
			.addRubber('r2', { staticRendering: true })
			.build()

		// init player
		player = new Player(table).init()
	})

	it('should update visibility even when rendering is static', async () => {
		table.rubbers.r2.getApi().Visible = false
		const states = player.popStates()
		expect(states.getState<RubberState>('r2').isVisible).to.equal(false)
		states.getState<RubberState>('r2').release()
	})

	it('should update visibility when rendering is dynamic', async () => {
		table.rubbers.r1.getApi().Visible = false
		const states = player.popStates()
		expect(states.getState<RubberState>('r1').isVisible).to.equal(false)
		states.getState<RubberState>('r1').release()
	})

	it('should apply visibility', async () => {
		const renderApi = new TestRenderApi()
		spy(renderApi, 'applyVisibility')
		table.rubbers.r1.getUpdater().applyState(null, { isVisible: true } as RubberState, renderApi as any, table)
		expect(renderApi.applyVisibility).to.have.been.calledOnceWith(true)
	})

	it('should apply the material', async () => {
		const renderApi = new TestRenderApi()
		spy(renderApi, 'applyMaterial')
		table.rubbers.r1.getUpdater().applyState(null, { material: 'opaque' } as RubberState, renderApi as any, table)
		expect(renderApi.applyMaterial).to.have.been.calledOnce
	})

	it('should apply the transformation', async () => {
		const renderApi = new TestRenderApi()
		spy(renderApi, 'applyMatrixToNode')
		table.rubbers.r1.getUpdater().applyState(null, { rotX: 30 } as RubberState, renderApi as any, table)
		expect(renderApi.applyMatrixToNode).to.have.been.calledOnce
	})

	it('should apply an identity matrix when the state matches the data', async () => {
		const rubber = table.rubbers.r1
		const renderApi = new CapturingRenderApi()
		rubber.getUpdater().applyState(
			null,
			{
				rotX: rubber.data.rotX,
				rotY: rubber.data.rotY,
				rotZ: rubber.data.rotZ,
				height: rubber.data.height,
			} as RubberState,
			renderApi as any,
			table,
		)
		expect(renderApi.matrices).to.have.lengthOf(1)
		const [matrix] = renderApi.matrices
		expect(Array.from(matrix.elements)).to.deep.equal(Array.from(new Matrix3D().elements))
	})

	it('should move the mesh when transforming via the API', async () => {
		const rubber = table.rubbers.r1
		rubber.getApi().RotX = 30
		const states = player.popStates()
		const diff = states.getState<RubberState>('r1')
		const renderApi = new CapturingRenderApi()
		rubber.getUpdater().applyState(null, diff as RubberState, renderApi as any, table)
		diff.release()
		expect(renderApi.matrices).to.have.lengthOf(1)
		expect(Array.from(renderApi.matrices[0].elements)).not.to.deep.equal(Array.from(new Matrix3D().elements))
	})

	it('should translate by the height delta for height-only changes', async () => {
		const rubber = table.rubbers.r1
		const renderApi = new CapturingRenderApi()
		rubber.getUpdater().applyState(null, { height: 60 } as RubberState, renderApi as any, table)
		const [matrix] = renderApi.matrices
		const e = matrix.elements
		expect(e[14]).to.be.closeTo(rubber.data.height - 60, 1e-6)
		expect([e[0], e[5], e[10]]).to.deep.equal([1, 1, 1])
	})

	it('should map baked vertices exactly onto a freshly baked transform', async () => {
		const baked = new TableBuilder().addRubber('r', {}).build()
		const fresh = new TableBuilder().addRubber('r', { rotX: 10, rotY: 15, rotZ: 25, height: 40 }).build()
		new Player(baked).init()
		const rubber = baked.rubbers.r
		const renderApi = new CapturingRenderApi()
		rubber
			.getUpdater()
			.applyState(null, { rotX: 10, rotY: 15, rotZ: 25, height: 40 } as RubberState, renderApi as any, baked)
		// Same row-major→three transpose as ThreeRenderApi.applyMatrixToNode.
		const e = renderApi.matrices[0].elements
		const three = new Matrix4().set(
			e[0],
			e[4],
			e[8],
			e[12],
			e[1],
			e[5],
			e[9],
			e[13],
			e[2],
			e[6],
			e[10],
			e[14],
			e[3],
			e[7],
			e[11],
			e[15],
		)
		const actual = rubber.getMeshes(baked).rubber.mesh!.vertices
		const expected = fresh.rubbers.r.getMeshes(fresh).rubber.mesh!.vertices
		expect(actual.length).to.equal(expected.length)
		for (let i = 0; i < actual.length; i++) {
			const moved = new Vector3(actual[i].x, actual[i].y, actual[i].z).applyMatrix4(three)
			expect(moved.x).to.be.closeTo(expected[i].x, 1e-4)
			expect(moved.y).to.be.closeTo(expected[i].y, 1e-4)
			expect(moved.z).to.be.closeTo(expected[i].z, 1e-4)
		}
	})
})
