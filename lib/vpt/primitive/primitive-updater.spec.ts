// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import { spy } from 'sinon'
import sinonChai from 'sinon-chai'
import { TableBuilder } from '../../../test/table-builder.js'
import { TestRenderApi } from '../../../test/test-render-api.js'
import { Player } from '../../game/player.js'
import { Vertex3D } from '../../util/vector.js'
import type { Table } from '../table/table.js'
import type { PrimitiveState } from './primitive-state.js'

chai.use((sinonChai as any).default ?? sinonChai)

describe('The VPinball primitive updater', () => {
	let table: Table
	let player: Player

	beforeEach(() => {
		table = new TableBuilder()
			.addMaterial('mat')
			.addPrimitive('pStatic', { staticRendering: true })
			.addPrimitive('pDynamic', { staticRendering: false })
			.build()

		// init player
		player = new Player(table).init()
	})

	it('should update visibility even when static rendering is enabled', () => {
		table.primitives.pStatic.getApi().Visible = false
		const states = player.popStates()
		expect(states.getState<PrimitiveState>('pStatic').isVisible).to.equal(false)
		states.getState<PrimitiveState>('pStatic').release()
	})

	it('should update visibility when static rendering is disabled', () => {
		table.primitives.pDynamic.getApi().Visible = false
		const states = player.popStates()
		expect(states.getState<PrimitiveState>('pDynamic').isVisible).to.equal(false)
		states.getState<PrimitiveState>('pDynamic').release()
	})

	it('should update the material', () => {
		const renderApi = new TestRenderApi()
		spy(renderApi, 'applyMaterial')
		table.primitives.pDynamic.getUpdater().applyState(null, { material: 'mat' } as PrimitiveState, renderApi, table)
		expect(renderApi.applyMaterial).to.have.been.calledOnce
	})

	it('should update the transformation matrix', () => {
		const renderApi = new TestRenderApi()
		spy(renderApi, 'applyMatrixToNode')
		table.primitives.pDynamic
			.getUpdater()
			.applyState(null, { size: new Vertex3D(1.5, 1, 1) } as PrimitiveState, renderApi, table)
		table.primitives.pDynamic
			.getUpdater()
			.applyState(null, { rotation: new Vertex3D(45, 0, 0) } as PrimitiveState, renderApi, table)
		table.primitives.pDynamic
			.getUpdater()
			.applyState(null, { translation: new Vertex3D(50, 10, 0) } as PrimitiveState, renderApi, table)
		table.primitives.pDynamic
			.getUpdater()
			.applyState(null, { objectRotation: new Vertex3D(0, 45, 0) } as PrimitiveState, renderApi, table)
		expect(renderApi.applyMatrixToNode).to.have.been.callCount(4)
	})
})
