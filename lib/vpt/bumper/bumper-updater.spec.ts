// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import { spy } from 'sinon'
import sinonChai from 'sinon-chai'
import { MathUtils } from 'three'
import { TableBuilder } from '../../../test/table-builder.js'
import { TestRenderApi } from '../../../test/test-render-api.js'
import { Player } from '../../game/player.js'
import type { Matrix3D } from '../../math/matrix.js'
import type { IRenderApi } from '../../render/irender-api.js'
import type { Table } from '../table/table.js'
import type { BumperState } from './bumper.js'

chai.use((sinonChai as any).default ?? sinonChai)

class CapturingRenderApi extends TestRenderApi {
	public readonly matrices: Matrix3D[] = []

	public override applyMatrixToNode(matrix: Matrix3D, _node: unknown): void {
		this.matrices.push(matrix.clone())
	}
}

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
		table.bumpers.b1
			.getUpdater()
			.applyState(
				null,
				{ isBaseVisible: true } as BumperState,
				renderApi as unknown as IRenderApi<null, unknown, unknown>,
				table,
			)
		expect(renderApi.applyVisibility).to.have.been.calledOnceWith(true)
	})

	it('should tilt the skirt by the state angle in degrees', () => {
		const renderApi = new CapturingRenderApi()
		const updater = table.bumpers.b1.getUpdater()
		updater.applyState(
			null,
			{ skirtRotX: 5, skirtRotY: 0 } as BumperState,
			renderApi as unknown as IRenderApi<null, unknown, unknown>,
			table,
		)
		updater.applyState(
			null,
			{ skirtRotX: 0, skirtRotY: 5 } as BumperState,
			renderApi as unknown as IRenderApi<null, unknown, unknown>,
			table,
		)
		expect(renderApi.matrices).to.have.lengthOf(2)
		const [tiltX, tiltY] = renderApi.matrices
		expect(tiltX.elements[5]).to.be.closeTo(Math.cos(MathUtils.degToRad(5)), 1e-6)
		expect(tiltX.elements[6]).to.be.closeTo(Math.sin(MathUtils.degToRad(5)), 1e-6)
		expect(tiltY.elements[0]).to.be.closeTo(Math.cos(MathUtils.degToRad(5)), 1e-6)
		expect(tiltY.elements[8]).to.be.closeTo(Math.sin(MathUtils.degToRad(5)), 1e-6)
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
			renderApi as unknown as IRenderApi<null, unknown, unknown>,
			table,
		)
		expect(renderApi.applyMaterial).to.have.been.callCount(4)
	})
})
