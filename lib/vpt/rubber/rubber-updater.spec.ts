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
import type { RubberState } from './rubber-state.js'

chai.use((sinonChai as any).default ?? sinonChai)

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

	it('should not update visibility when rendering is static', async () => {
		table.rubbers.r2.getApi().Visible = false
		const states = player.popStates()
		expect(states.getState<RubberState>('r2')).not.to.be.ok
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
		table.rubbers.r1.getUpdater().applyState(null, { isVisible: true } as RubberState, renderApi, table)
		expect(renderApi.applyVisibility).to.have.been.calledOnceWith(true)
	})

	it('should apply the material', async () => {
		const renderApi = new TestRenderApi()
		spy(renderApi, 'applyMaterial')
		table.rubbers.r1.getUpdater().applyState(null, { material: 'opaque' } as RubberState, renderApi, table)
		expect(renderApi.applyMaterial).to.have.been.calledOnce
	})

	it('should apply the transformation', async () => {
		const renderApi = new TestRenderApi()
		spy(renderApi, 'applyMatrixToNode')
		table.rubbers.r1.getUpdater().applyState(null, { rotX: 30 } as RubberState, renderApi, table)
		expect(renderApi.applyMatrixToNode).to.have.been.calledOnce
	})
})
