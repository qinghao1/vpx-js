import * as chai from 'chai'
import { expect } from 'chai'
import { spy } from 'sinon'
import sinonChai from 'sinon-chai'
import { TestRenderApi } from '../../test/test-render-api.js'
import type { IRenderApi } from '../render/irender-api.js'
import { ItemState } from './item-state.js'
import { ItemUpdater } from './item-updater.js'
import type { Table } from './table/table.js'

chai.use((sinonChai as any).default ?? sinonChai)

class VisibilityState extends ItemState {}

class VisibilityUpdater extends ItemUpdater<VisibilityState> {
	public override applyState<NODE, GEOMETRY, POINT_LIGHT>(
		_obj: NODE,
		_state: VisibilityState,
		_renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		_table: Table,
	): void {}
	public applyPassedVisibility<NODE, GEOMETRY, POINT_LIGHT>(
		obj: NODE,
		state: VisibilityState,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
	): void {
		this.applyVisibility(obj, state, renderApi)
	}
}

describe('The VPinball item updater', () => {
	it('should apply the visibility of the passed state, not the construction state', () => {
		const renderApi = new TestRenderApi()
		spy(renderApi, 'applyVisibility')
		const constructed = new VisibilityState()
		constructed.isVisible = true
		const updater = new VisibilityUpdater(constructed)
		const passed = new VisibilityState()
		passed.isVisible = false
		updater.applyPassedVisibility(null, passed, renderApi as unknown as IRenderApi<null, unknown, unknown>)
		expect(renderApi.applyVisibility).to.have.been.calledOnceWith(false)
	})

	it('should not apply visibility when the passed state has none', () => {
		const renderApi = new TestRenderApi()
		spy(renderApi, 'applyVisibility')
		const constructed = new VisibilityState()
		constructed.isVisible = false
		const updater = new VisibilityUpdater(constructed)
		const passed = new VisibilityState()
		passed.isVisible = undefined as unknown as boolean
		updater.applyPassedVisibility(null, passed, renderApi as unknown as IRenderApi<null, unknown, unknown>)
		expect(renderApi.applyVisibility).to.not.have.been.called
	})
})
