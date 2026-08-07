// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import { spy } from 'sinon'
import sinonChai from 'sinon-chai'
import { TableBuilder } from '../../../test/table-builder.js'
import { TestRenderApi } from '../../../test/test-render-api.js'
import { Player } from '../../game/player.js'
import { Enums } from '../enums.js'
import type { Table } from '../table/table.js'
import type { RampState } from './ramp-state.js'

chai.use((sinonChai as any).default ?? sinonChai)

describe('The VPinball ramp updater', () => {
	let table: Table
	let player: Player

	beforeEach(() => {
		table = new TableBuilder()
			.addMaterial('opaque', { isOpacityActive: false })
			.addMaterial('transparent', { isOpacityActive: true })
			.addRamp('ramp1', { szMaterial: 'opaque', rampType: Enums.RampType.RampTypeFlat })
			.addRamp('ramp2', { szMaterial: 'transparent', rampType: Enums.RampType.RampTypeFlat })
			.addRamp('ramp3', { szMaterial: 'transparent', rampType: Enums.RampType.RampType4Wire })
			.build()

		// init player
		player = new Player(table).init()
	})

	it('should not update visibility when opacity is inactive', async () => {
		table.ramps.ramp1.getApi().Visible = false
		const states = player.popStates()
		expect(states.getState<RampState>('ramp1')).not.to.be.ok
	})

	it('should update visibility when opacity is active', async () => {
		table.ramps.ramp2.getApi().Visible = false
		const states = player.popStates()

		expect(states.getState<RampState>('ramp2').isVisible).to.equal(false)
		states.getState<RampState>('ramp2').release()
	})

	it('should apply visibility', async () => {
		const renderApi = new TestRenderApi()
		spy(renderApi, 'applyVisibility')
		table.ramps.ramp2.getUpdater().applyState(null, { isVisible: true } as RampState, renderApi, table)
		expect(renderApi.applyVisibility).to.have.been.calledOnceWith(true)
	})

	it('should update the flat mesh', async () => {
		const renderApi = new TestRenderApi()
		spy(renderApi, 'applyMeshToNode')
		table.ramps.ramp2.getUpdater().applyState(null, { heightTop: 500 } as RampState, renderApi, table)
		expect(renderApi.applyMeshToNode).to.have.been.callCount(3)
	})

	it('should update the wire mesh', async () => {
		const renderApi = new TestRenderApi()
		spy(renderApi, 'applyMeshToNode')
		table.ramps.ramp3.getUpdater().applyState(null, { heightTop: 500 } as RampState, renderApi, table)
		expect(renderApi.applyMeshToNode).to.have.been.callCount(4)
	})

	it('should replace a mesh', async () => {
		const renderApi = new TestRenderApi()
		spy(renderApi, 'removeChildren')
		spy(renderApi, 'addChildToParent')
		table.ramps.ramp2
			.getUpdater()
			.applyState(null, { type: Enums.RampType.RampType2Wire } as RampState, renderApi, table)
		expect(renderApi.removeChildren).to.have.been.calledOnce
		expect(renderApi.addChildToParent).to.have.been.calledTwice
	})
})
