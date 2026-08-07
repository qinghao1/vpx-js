// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import { spy } from 'sinon'
import sinonChai from 'sinon-chai'
import { TableBuilder } from '../../../test/table-builder.js'
import { TestRenderApi } from '../../../test/test-render-api.js'
import { Player } from '../../game/player.js'
import type { Table } from '../table/table.js'
import type { SurfaceState } from './surface-state.js'

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
			.applyState(null, { isTopVisible: true, isSideVisible: true } as SurfaceState, renderApi, table)
		expect(renderApi.applyVisibility).to.have.been.calledTwice
	})

	it('should apply the material', () => {
		const renderApi = new TestRenderApi()
		spy(renderApi, 'applyMaterial')
		table.surfaces.s1
			.getUpdater()
			.applyState(null, { topMaterial: 'dynamic', sideMaterial: 'dynamic' } as SurfaceState, renderApi, table)
		expect(renderApi.applyMaterial).to.have.been.calledTwice
	})

	it('should apply the transformation', async () => {
		const renderApi = new TestRenderApi()
		spy(renderApi, 'applyMatrixToNode')
		table.surfaces.s1.getUpdater().applyState(null, { isDropped: true } as SurfaceState, renderApi, table)
		expect(renderApi.applyMatrixToNode).to.have.been.calledOnce
	})
})
