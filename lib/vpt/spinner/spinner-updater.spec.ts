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
import { Matrix3D } from '../../util/matrix.js'
import type { Table } from '../table/table.js'
import { SpinnerMeshGenerator } from './spinner-mesh-generator.js'
import type { SpinnerState } from './spinner-state.js'

chai.use((sinonChai as any).default ?? sinonChai)

describe('The VPinball spinner updater', () => {
	let table: Table
	let player: Player

	beforeEach(() => {
		table = new TableBuilder().addMaterial('opaque', { isOpacityActive: false }).addSpinner('spinner').build()

		// init player
		player = new Player(table).init()
	})

	it('should update visibility', async () => {
		table.spinners.spinner.getApi().Visible = false
		const states = player.popStates()

		expect(states.getState<SpinnerState>('spinner').isVisible).to.equal(false)
		states.getState<SpinnerState>('spinner').release()
	})

	it('should apply visibility', async () => {
		const renderApi = new TestRenderApi()
		spy(renderApi, 'applyVisibility')
		table.spinners.spinner
			.getUpdater()
			.applyState(null, { isVisible: true, showBracket: false } as SpinnerState, renderApi, table)
		expect(renderApi.applyVisibility).to.have.been.calledTwice
	})

	it('should apply the material', async () => {
		const renderApi = new TestRenderApi()
		spy(renderApi, 'applyMaterial')
		table.spinners.spinner.getUpdater().applyState(null, { material: 'opaque' } as SpinnerState, renderApi, table)
		expect(renderApi.applyMaterial).to.have.been.calledOnce
	})

	it('should apply the transformation', async () => {
		const renderApi = new TestRenderApi()
		spy(renderApi, 'applyMatrixToNode')
		table.spinners.spinner.getUpdater().applyState(null, { angle: 15 } as SpinnerState, renderApi, table)
		expect(renderApi.applyMatrixToNode).to.have.been.calledOnce
	})

	describe('regression: spinner rotation direction', () => {
		function captureSpinner(angle: number, rotation = 0): { cap: Matrix3D; posZ: number; table: Table } {
			const t = new TableBuilder().addSpinner('s', { rotation } as any).build()
			const spinner: any = t.spinners.s
			spinner.data.center.x = 500
			spinner.data.center.y = 500
			const api: any = new TestRenderApi()
			let cap: Matrix3D | null = null
			api.applyMatrixToNode = (m: Matrix3D) => {
				cap = m.clone()
			}
			api.findInGroup = () => ({})
			spinner.getUpdater().applyState({}, { angle } as SpinnerState, api, t)
			if (!cap) throw new Error('no matrix')
			const gen = new SpinnerMeshGenerator(spinner.data)
			const posZ = -gen.getZ(t)
			return { cap: cap as Matrix3D, posZ, table: t }
		}

		function expected(center: { x: number; y: number }, posZ: number, rotation: number, angle: number): Matrix3D {
			const Tneg = new Matrix3D().setTranslation(-center.x, -center.y, -posZ)
			const RzNeg = new Matrix3D().rotateZMatrix(MathUtils.degToRad(-rotation))
			const Rx = new Matrix3D().rotateXMatrix(angle)
			const RzPos = new Matrix3D().rotateZMatrix(MathUtils.degToRad(rotation))
			const Tpos = new Matrix3D().setTranslation(center.x, center.y, posZ)
			return Tneg.clone().multiply(RzNeg).multiply(Rx).multiply(RzPos).multiply(Tpos)
		}

		it('should use posZ = -getZ and angle = +state.angle (matches VPinball Rx(-angle))', () => {
			const angle = 0.5
			for (const rot of [0, -90, 30]) {
				const { cap, posZ } = captureSpinner(angle, rot)
				const ideal = angle
				const exp = expected({ x: 500, y: 500 }, posZ, rot, ideal)
				for (let i = 0; i < 16; i++) expect(cap.elements[i], `rot ${rot}`).to.be.closeTo(exp.elements[i], 1e-6)
			}
		})

		it('should handle negative angle', () => {
			const { cap, posZ } = captureSpinner(-0.7, 15)
			const exp = expected({ x: 500, y: 500 }, posZ, 15, -0.7)
			for (let i = 0; i < 16; i++) expect(cap.elements[i]).to.be.closeTo(exp.elements[i], 1e-6)
		})
	})
})
