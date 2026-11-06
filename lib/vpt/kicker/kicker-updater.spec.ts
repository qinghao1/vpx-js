// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import { spy } from 'sinon'
import sinonChai from 'sinon-chai'
import { TableBuilder } from '../../../test/table-builder.js'
import { TestRenderApi } from '../../../test/test-render-api.js'
import type { IRenderApi } from '../../render/irender-api.js'
import { Enums } from '../enums.js'
import type { Table } from '../table/table.js'
import type { KickerState } from './kicker.js'

chai.use((sinonChai as any).default ?? sinonChai)

describe('The VPinball kicker updater', () => {
	let table: Table

	beforeEach(() => {
		table = new TableBuilder().addMaterial('opaque', { isOpacityActive: false }).addKicker('kicker').build()
	})

	it('should apply visibility', async () => {
		const renderApi = new TestRenderApi()
		spy(renderApi, 'applyVisibility')
		table.kickers.kicker
			.getUpdater()
			.applyState(
				null,
				{ type: Enums.KickerType.KickerInvisible } as KickerState,
				renderApi as unknown as IRenderApi<null, unknown, unknown>,
				table,
			)
		expect(renderApi.applyVisibility).to.have.been.calledOnceWith(false)
	})

	it('should apply the material', async () => {
		const renderApi = new TestRenderApi()
		spy(renderApi, 'applyMaterial')
		table.kickers.kicker
			.getUpdater()
			.applyState(
				null,
				{ material: 'opaque' } as KickerState,
				renderApi as unknown as IRenderApi<null, unknown, unknown>,
				table,
			)
		expect(renderApi.applyMaterial).to.have.been.calledOnce
	})
})
