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
import type { IRenderApi } from '../../render/irender-api.js'
import type { Table } from '../table/table.js'
import type { SurfaceState } from './surface.js'

chai.use((sinonChai as any).default ?? sinonChai)

describe('The VPinball surface updater', () => {
	let table: Table
	let player: Player

	beforeEach(() => {
		table = new TableBuilder()
			.addMaterial('static', { isOpacityActive: false })
			.addMaterial('dynamic', { isOpacityActive: true })
			.addSurface('s1', { szTopMaterial: 'static', szSideMaterial: 'dynamic' })
			.addSurface('s2', { szTopMaterial: 'static', szSideMaterial: 'static' })
			.build()

		// init player
		player = new Player(table).init()
	})

	it('should not update visibility when opacity is disabled', () => {
		table.surfaces.s2.getApi().Visible = false
		table.surfaces.s2.getApi().SideVisible = false
		const states = player.popStates()
		expect(states.getState<SurfaceState>('s2')).not.to.be.ok
	})

	it('should update visibility when opacity is active', () => {
		table.surfaces.s1.getApi().SideVisible = false
		table.surfaces.s1.getApi().Visible = false
		const states = player.popStates()
		expect(states.getState<SurfaceState>('s1').isTopVisible).to.equal(false)
		expect(states.getState<SurfaceState>('s1').isSideVisible).to.equal(false)
		states.getState<SurfaceState>('s1').release()
	})

	it('should apply visibility', async () => {
		const renderApi = new TestRenderApi()
		spy(renderApi, 'applyVisibility')
		table.surfaces.s1
			.getUpdater()
			.applyState(
				null,
				{ isTopVisible: true, isSideVisible: true } as SurfaceState,
				renderApi as unknown as IRenderApi<null, unknown, unknown>,
				table,
			)
		expect(renderApi.applyVisibility).to.have.been.calledTwice
	})

	it('should apply the material', () => {
		const renderApi = new TestRenderApi()
		spy(renderApi, 'applyMaterial')
		table.surfaces.s1
			.getUpdater()
			.applyState(
				null,
				{ topMaterial: 'dynamic', sideMaterial: 'dynamic' } as SurfaceState,
				renderApi as unknown as IRenderApi<null, unknown, unknown>,
				table,
			)
		expect(renderApi.applyMaterial).to.have.been.calledTwice
	})

	it('should apply the transformation', async () => {
		const renderApi = new TestRenderApi()
		spy(renderApi, 'applyMatrixToNode')
		table.surfaces.s1
			.getUpdater()
			.applyState(
				null,
				{ isDropped: true } as SurfaceState,
				renderApi as unknown as IRenderApi<null, unknown, unknown>,
				table,
			)
		expect(renderApi.applyMatrixToNode).to.have.been.calledOnce
	})

	describe('dropped walls', () => {
		function applyDropStates(attrs: Record<string, unknown>, states: Partial<SurfaceState>[]) {
			const dropTable = new TableBuilder()
				.addMaterial('static', { isOpacityActive: false })
				.addSurface('wall', { isDroppable: true, heightTop: 50, heightBottom: 10, ...attrs })
				.build()
			const tableData = dropTable.data
			if (!tableData) throw new Error('Table data not loaded')
			tableData.bgScaleZ[tableData.bgCurrentSet] = 2
			const wall = dropTable.surfaces.wall
			const renderApi = new TestRenderApi() as any
			const sideNode = { nodeName: 'side' }
			const topNode = { nodeName: 'top' }
			renderApi.findInGroup = (_parent: unknown, name: string) =>
				name.startsWith('surface.side-') ? sideNode : topNode
			const appliedMatrices: { matrix: Matrix3D; node: unknown }[] = []
			const appliedVisibilities: { isVisible: boolean; node: unknown }[] = []
			renderApi.applyMatrixToNode = (matrix: Matrix3D, node: unknown) => {
				appliedMatrices.push({ matrix: matrix.clone(), node })
			}
			renderApi.applyVisibility = (isVisible: boolean, node: unknown) => {
				appliedVisibilities.push({ isVisible, node })
			}
			for (const state of states) wall.getUpdater().applyState({}, state as SurfaceState, renderApi, dropTable)
			return { dropTable, sideNode, topNode, appliedMatrices, appliedVisibilities }
		}

		it('should hide the sides and drop the top to heightBottom+0.1 when dropped', () => {
			const { dropTable, sideNode, topNode, appliedMatrices, appliedVisibilities } = applyDropStates({}, [
				{ isDropped: true },
			])
			expect(appliedVisibilities.map(entry => entry.isVisible)).to.deep.equal([false])
			expect(appliedVisibilities[0].node).to.equal(sideNode)
			expect(appliedMatrices.length).to.equal(1)
			expect(appliedMatrices[0].node).to.equal(topNode)
			const expectedTz = (50 - 10 - 0.1) * dropTable.getScaleZ()
			expect(appliedMatrices[0].matrix.elements[14]).to.be.closeTo(expectedTz, 1e-6)
		})

		it('should hide the whole wall when a flipbook wall is dropped', () => {
			const { sideNode, topNode, appliedMatrices, appliedVisibilities } = applyDropStates({ isFlipbook: true }, [
				{ isDropped: true },
			])
			expect(appliedMatrices).to.deep.equal([])
			expect(appliedVisibilities.map(entry => entry.isVisible)).to.deep.equal([false, false])
			expect(appliedVisibilities[0].node).to.equal(sideNode)
			expect(appliedVisibilities[1].node).to.equal(topNode)
		})

		it('should restore the top and sides when raised', () => {
			const { sideNode, topNode, appliedMatrices, appliedVisibilities } = applyDropStates({}, [
				{ isDropped: true },
				{ isDropped: false },
			])
			expect(appliedVisibilities.map(entry => entry.isVisible)).to.deep.equal([false, true, true])
			expect(appliedVisibilities[1].node).to.equal(sideNode)
			expect(appliedVisibilities[2].node).to.equal(topNode)
			expect(appliedMatrices.length).to.equal(2)
			expect(appliedMatrices[1].node).to.equal(topNode)
			expect(appliedMatrices[1].matrix.elements[14]).to.equal(0)
		})
	})
})
