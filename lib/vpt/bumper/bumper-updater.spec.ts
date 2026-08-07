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
import type { BumperState } from './bumper-state.js'

chai.use((sinonChai as any).default ?? sinonChai)

describe('The VPinball bumper updater', () => {
	let table: Table
	let player: Player

	beforeEach(() => {
		table = new TableBuilder()
			.addMaterial('static', { isOpacityActive: false })
			.addMaterial('dynamic', { isOpacityActive: true })
			.addBumper('b1', {
				szCapMaterial: 'static',
				szRingMaterial: 'static',
				szBaseMaterial: 'dynamic',
				szSkirtMaterial: 'dynamic',
			})
			.addBumper('b2', {
				szCapMaterial: 'dynamic',
				szRingMaterial: 'dynamic',
				szBaseMaterial: 'static',
				szSkirtMaterial: 'static',
			})
			.build()

		// init player
		player = new Player(table).init()
	})

	it('should not update visibility when opacity is disabled', () => {
		table.bumpers.b1.getApi().CapVisible = false
		table.bumpers.b1.getApi().RingVisible = false
		table.bumpers.b2.getApi().BaseVisible = false
		table.bumpers.b2.getApi().SkirtVisible = false
		const states = player.popStates()
		expect(states.getState<BumperState>('b1')).not.to.be.ok
		expect(states.getState<BumperState>('b2')).not.to.be.ok
	})

	it('should update visibility when static rendering is disabled', () => {
		table.bumpers.b2.getApi().CapVisible = false
		table.bumpers.b2.getApi().RingVisible = false
		table.bumpers.b1.getApi().BaseVisible = false
		table.bumpers.b1.getApi().SkirtVisible = false
		const states = player.popStates()
		expect(states.getState<BumperState>('b2').isCapVisible).to.equal(false)
		expect(states.getState<BumperState>('b2').isRingVisible).to.equal(false)
		expect(states.getState<BumperState>('b1').isBaseVisible).to.equal(false)
		expect(states.getState<BumperState>('b1').isSkirtVisible).to.equal(false)
		states.getState<BumperState>('b1').release()
		states.getState<BumperState>('b2').release()
	})

	it('should apply visibility', async () => {
		const renderApi = new TestRenderApi()
		spy(renderApi, 'applyVisibility')
		table.bumpers.b1.getUpdater().applyState(null, { isBaseVisible: true } as BumperState, renderApi, table)
		expect(renderApi.applyVisibility).to.have.been.calledOnceWith(true)
	})

	it('should update the material', () => {
		const renderApi = new TestRenderApi()
		spy(renderApi, 'applyMaterial')
		table.bumpers.b1.getUpdater().applyState(
			null,
			{
				capMaterial: 'dynamic',
				ringMaterial: 'dynamic',
				baseMaterial: 'static',
				skirtMaterial: 'static',
			} as unknown as BumperState,
			renderApi,
			table,
		)
		expect(renderApi.applyMaterial).to.have.been.callCount(4)
	})
})
