// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import { spy } from 'sinon'
import sinonChai from 'sinon-chai'
import { TableBuilder } from '../../../test/table-builder.js'
import { TestRenderApi } from '../../../test/test-render-api.js'
import { Player } from '../../game/player.js'
import type { IRenderApi } from '../../render/irender-api.js'
import type { Table } from '../table/table.js'
import type { GateState } from './gate-state.js'

chai.use((sinonChai as any).default ?? sinonChai)

describe('The VPinball gate updater', () => {
	let table: Table
	let player: Player

	beforeEach(() => {
		table = new TableBuilder().addMaterial('opaque', { isOpacityActive: false }).addGate('gate').build()

		// init player
		player = new Player(table).init()
	})

	it('should update visibility', async () => {
		table.gates.gate.getApi().Visible = false
		const states = player.popStates()

		expect(states.getState<GateState>('gate').isVisible).to.equal(false)
		states.getState<GateState>('gate').release()
	})

	it('should apply visibility', async () => {
		const renderApi = new TestRenderApi()
		spy(renderApi, 'applyVisibility')
		table.gates.gate
			.getUpdater()
			.applyState(
				null,
				{ isVisible: true, showBracket: false } as GateState,
				renderApi as unknown as IRenderApi<null, unknown, unknown>,
				table,
			)
		expect(renderApi.applyVisibility).to.have.been.calledTwice
	})

	it('should apply the material', async () => {
		const renderApi = new TestRenderApi()
		spy(renderApi, 'applyMaterial')
		table.gates.gate
			.getUpdater()
			.applyState(
				null,
				{ material: 'opaque' } as GateState,
				renderApi as unknown as IRenderApi<null, unknown, unknown>,
				table,
			)
		expect(renderApi.applyMaterial).to.have.been.calledOnce
	})

	it('should apply the transformation', async () => {
		const renderApi = new TestRenderApi()
		spy(renderApi, 'applyMatrixToNode')
		table.gates.gate
			.getUpdater()
			.applyState(
				null,
				{ angle: 10 } as GateState,
				renderApi as unknown as IRenderApi<null, unknown, unknown>,
				table,
			)
		expect(renderApi.applyMatrixToNode).to.have.been.calledOnce
	})

	// NOTE: rotation-direction coverage lives in gate-visual-regression.spec.ts, which
	// compares end-to-end world positions against an independent brute-force C++ D3D
	// pipeline (plus negative controls) instead of a hand-constructed matrix.
})
