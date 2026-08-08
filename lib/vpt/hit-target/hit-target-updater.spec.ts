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
import type { HitTargetState } from './hit-target-state.js'

chai.use((sinonChai as any).default ?? sinonChai)

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
		table.hitTargets.target.getUpdater().applyState(null, { isVisible: true } as HitTargetState, renderApi, table)
		expect(renderApi.applyVisibility).to.have.been.calledOnce
	})

	it('should apply the material', async () => {
		const renderApi = new TestRenderApi()
		spy(renderApi, 'applyMaterial')
		table.hitTargets.target
			.getUpdater()
			.applyState(null, { material: 'opaque' } as HitTargetState, renderApi, table)
		expect(renderApi.applyMaterial).to.have.been.calledOnce
	})

	it('should apply the transformation', async () => {
		const renderApi = new TestRenderApi()
		spy(renderApi, 'applyMatrixToNode')
		table.hitTargets.target.getUpdater().applyState(null, { zOffset: 10 } as HitTargetState, renderApi, table)
		expect(renderApi.applyMatrixToNode).to.have.been.calledOnce
	})
})
