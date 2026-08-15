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
			.applyState(null, { isVisible: true, showBracket: false } as GateState, renderApi, table)
		expect(renderApi.applyVisibility).to.have.been.calledTwice
	})

	it('should apply the material', async () => {
		const renderApi = new TestRenderApi()
		spy(renderApi, 'applyMaterial')
		table.gates.gate.getUpdater().applyState(null, { material: 'opaque' } as GateState, renderApi, table)
		expect(renderApi.applyMaterial).to.have.been.calledOnce
	})

	it('should apply the transformation', async () => {
		const renderApi = new TestRenderApi()
		spy(renderApi, 'applyMatrixToNode')
		table.gates.gate.getUpdater().applyState(null, { angle: 10 } as GateState, renderApi, table)
		expect(renderApi.applyMatrixToNode).to.have.been.calledOnce
	})

	describe('regression: wire gate rotation direction', () => {
		function captureMatrix(
			angle: number,
			opts: { gateType?: number; twoWay?: boolean; rotation?: number; height?: number; length?: number } = {},
		): Matrix3D {
			const attrs: any = {}
			if (opts.gateType !== undefined) attrs.gateType = opts.gateType
			if (opts.twoWay !== undefined) attrs.twoWay = opts.twoWay
			if (opts.rotation !== undefined) attrs.rotation = opts.rotation
			if (opts.height !== undefined) attrs.height = opts.height
			if (opts.length !== undefined) attrs.length = opts.length
			const t = new TableBuilder().addGate('g', attrs).build()
			const gate = t.gates.g as any
			gate.data.center.x = 500
			gate.data.center.y = 500
			const api = new TestRenderApi() as any
			let cap: Matrix3D | null = null
			api.applyMatrixToNode = (m: Matrix3D) => {
				cap = m.clone()
			}
			api.findInGroup = () => ({})
			gate.getUpdater().applyState({}, { angle } as GateState, api, t)
			if (!cap) throw new Error('no matrix captured')
			return cap as Matrix3D
		}

		function expectedMatrix(
			center: { x: number; y: number },
			posZ: number,
			rotation: number,
			angle: number,
		): Matrix3D {
			const Tneg = new Matrix3D().setTranslation(-center.x, -center.y, -posZ)
			const RzNeg = new Matrix3D().rotateZMatrix(MathUtils.degToRad(-rotation))
			const Rx = new Matrix3D().rotateXMatrix(angle)
			const RzPos = new Matrix3D().rotateZMatrix(MathUtils.degToRad(rotation))
			const Tpos = new Matrix3D().setTranslation(center.x, center.y, posZ)
			return Tneg.clone().multiply(RzNeg).multiply(Rx).multiply(RzPos).multiply(Tpos)
		}

		it('should use posZ = -(height*scaleZ+base) and angle = twoWay?-angle:angle', () => {
			const angle = 0.5
			for (const twoWay of [true, false]) {
				const cap = captureMatrix(angle, { twoWay, rotation: 0 })
				const scaleZ = 1
				const base = 0
				const posZ = -(50 * scaleZ + base)
				const ideal = twoWay ? -angle : angle
				const exp = expectedMatrix({ x: 500, y: 500 }, posZ, 0, ideal)
				for (let i = 0; i < 16; i++) expect(cap.elements[i]).to.be.closeTo(exp.elements[i], 1e-6)
			}
		})

		it('should match VPinball C++ for all gate types and rotations (metal wire regression)', () => {
			const scaleZ = 1
			const posZ = -(50 * scaleZ + 0)
			for (const gateType of [1, 2, 3, 4]) {
				for (const rot of [0, -90, -15.2]) {
					for (const twoWay of [true, false]) {
						const angle = 0.5
						const cap = captureMatrix(angle, { gateType, twoWay, rotation: rot })
						const ideal = twoWay ? -angle : angle
						const exp = expectedMatrix({ x: 500, y: 500 }, posZ, rot, ideal)
						for (let i = 0; i < 16; i++)
							expect(cap.elements[i], `type ${gateType} rot ${rot} twoWay ${twoWay}`).to.be.closeTo(
								exp.elements[i],
								1e-6,
							)
					}
				}
			}
		})

		it('should move gate bottom with ball direction (wire and plate)', () => {
			const angle = 0.5
			const capWire = captureMatrix(angle, { gateType: 1, twoWay: true, rotation: 0 })
			const capPlate = captureMatrix(angle, { gateType: 3, twoWay: true, rotation: 0 })
			const center = { x: 500, y: 500 }
			const posZ = -50
			const ideal = -angle
			const exp = expectedMatrix(center, posZ, 0, ideal)
			for (let i = 0; i < 16; i++) {
				expect(capWire.elements[i]).to.be.closeTo(exp.elements[i], 1e-6)
				expect(capPlate.elements[i]).to.be.closeTo(exp.elements[i], 1e-6)
			}
		})

		it('should use negative posZ for surface gates (fixture)', async () => {
			const { Table } = await import('../table/table.js')
			const { NodeBinaryReader } = await import('../../io/binary-reader.node.js')
			const table = await Table.load(new NodeBinaryReader('test/fixtures/table-gate.vpx'))
			const gate: any = (table as any).gates.SurfaceGate
			const angle = 0.5
			const api: any = new TestRenderApi()
			let cap: Matrix3D | null = null
			api.applyMatrixToNode = (m: Matrix3D) => {
				cap = m.clone()
			}
			api.findInGroup = () => ({})
			gate.getUpdater().applyState({}, { angle } as GateState, api, table)
			const scaleZ = table.getScaleZ()
			const base = table.getSurfaceHeight(gate.data.szSurface, gate.data.center.x, gate.data.center.y) * scaleZ
			const expPosZ = -(gate.data.height * scaleZ + base)
			expect(expPosZ).to.equal(-100)
			const exp = expectedMatrix(gate.data.center, expPosZ, gate.data.rotation, -angle)
			for (let i = 0; i < 16; i++) expect(cap!.elements[i]).to.be.closeTo(exp.elements[i], 1e-6)
		})
	})
})
