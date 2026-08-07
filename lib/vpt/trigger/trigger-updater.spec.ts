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
import type { TriggerState } from './trigger-state.js'

chai.use((sinonChai as any).default ?? sinonChai)

describe('The VPinball trigger updater', () => {
	let table: Table
	let player: Player

	beforeEach(() => {
		table = new TableBuilder().addMaterial('mat').addTrigger('trigger').build()

		// init player
		player = new Player(table).init()
	})

	it('should update visibility', async () => {
		table.triggers.trigger.getApi().Visible = false
		const states = player.popStates()

		expect(states.getState<TriggerState>('trigger').isVisible).to.equal(false)
		states.getState<TriggerState>('trigger').release()
	})

	it('should apply visibility', async () => {
		const renderApi = new TestRenderApi()
		spy(renderApi, 'applyVisibility')
		table.triggers.trigger.getUpdater().applyState(null, { isVisible: true } as TriggerState, renderApi, table)
		expect(renderApi.applyVisibility).to.have.been.calledOnce
	})

	it('should apply the material', async () => {
		const renderApi = new TestRenderApi()
		spy(renderApi, 'applyMaterial')
		table.triggers.trigger.getUpdater().applyState(null, { material: 'mat' } as TriggerState, renderApi, table)
		expect(renderApi.applyMaterial).to.have.been.calledOnce
	})

	it('should apply the transformation', async () => {
		const renderApi = new TestRenderApi()
		spy(renderApi, 'applyMatrixToNode')
		table.triggers.trigger.getUpdater().applyState(null, { heightOffset: 99 } as TriggerState, renderApi, table)
		expect(renderApi.applyMatrixToNode).to.have.been.calledOnce
	})
})
