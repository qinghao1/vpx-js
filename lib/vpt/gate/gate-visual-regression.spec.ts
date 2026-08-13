// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { TableBuilder } from '../../../test/table-builder.js'
import { TestRenderApi } from '../../../test/test-render-api.js'
import { Matrix3D } from '../../util/matrix.js'
import { Vertex3D } from '../../util/vector.js'
import type { GateState } from './gate-state.js'

chai.use((sinonChai as any).default ?? sinonChai)

const RIGHT_HANDED = new Matrix3D().setScaling(1, 1, -1)

function toWorldFromD3D(p: Vertex3D): Vertex3D {
	return new Vertex3D(p.x, p.z, p.y)
}

function toWorldFromRH(p: Vertex3D): Vertex3D {
	return new Vertex3D(p.x, -p.z, p.y)
}

function bruteD3D(
	raw: Vertex3D,
	len: number,
	scaleZ: number,
	cx: number,
	cy: number,
	height: number,
	base: number,
	rotDeg: number,
	angle: number,
	twoWay: boolean,
): Vertex3D {
	const cppAngle = twoWay ? angle : -angle
	const rot = (rotDeg * Math.PI) / 180
	const posZ = height * scaleZ + base
	const full = new Matrix3D().rotateXMatrix(cppAngle).multiply(new Matrix3D().rotateZMatrix(rot))
	const vert = full
		.clone()
		.multiply(new Matrix3D().setScaling(len, len, len))
		.multiply(new Matrix3D().setTranslation(cx, cy, posZ))
	return new Vertex3D(raw.x, raw.y, raw.z).multiplyMatrix(vert)
}

function jsWorldViaUpdater(
	raw: Vertex3D,
	len: number,
	scaleZ: number,
	cx: number,
	cy: number,
	height: number,
	base: number,
	rotDeg: number,
	updaterMatrix: Matrix3D,
): Vertex3D {
	const rot = (rotDeg * Math.PI) / 180
	const posZWorld = height * scaleZ + base
	const mRz = new Matrix3D().rotateZMatrix(rot)
	const Slen = new Matrix3D().setScaling(len, len, len * scaleZ)
	const Tworld = new Matrix3D().setTranslation(cx, cy, posZWorld)
	const staticMat = mRz.clone().multiply(Slen).multiply(Tworld)
	const staticWithHand = staticMat.clone().multiply(RIGHT_HANDED)
	const total = staticWithHand.clone().multiply(updaterMatrix)
	return new Vertex3D(raw.x, raw.y, raw.z).multiplyMatrix(total)
}

function captureGateMatrix(
	angle: number,
	opts: { gateType?: number; twoWay?: boolean; rotation?: number; height?: number; length?: number } = {},
): {
	matrix: Matrix3D
	cx: number
	cy: number
	height: number
	base: number
	scaleZ: number
	len: number
	rot: number
	twoWay: boolean
} {
	const attrs: any = {}
	if (opts.gateType !== undefined) attrs.gateType = opts.gateType
	if (opts.twoWay !== undefined) attrs.twoWay = opts.twoWay
	if (opts.rotation !== undefined) attrs.rotation = opts.rotation
	if (opts.height !== undefined) attrs.height = opts.height
	if (opts.length !== undefined) attrs.length = opts.length
	const table = new TableBuilder().addGate('g', attrs).build()
	const gate: any = table.gates.g
	gate.data.center.x = 500
	gate.data.center.y = 500
	const scaleZ = table.getScaleZ()
	const base = table.getSurfaceHeight(gate.data.szSurface, gate.data.center.x, gate.data.center.y) * scaleZ
	const api: any = new TestRenderApi()
	let cap: Matrix3D | null = null
	api.applyMatrixToNode = (m: Matrix3D) => {
		cap = m.clone()
	}
	api.findInGroup = () => ({})
	gate.getUpdater().applyState({}, { angle } as GateState, api, table)
	if (!cap) throw new Error('no matrix captured')
	return {
		matrix: cap as Matrix3D,
		cx: gate.data.center.x,
		cy: gate.data.center.y,
		height: gate.data.height,
		base,
		scaleZ,
		len: gate.data.length,
		rot: gate.data.rotation,
		twoWay: gate.data.twoWay,
	}
}

describe('Gate visual regression vs VPinball C++ brute', () => {
	const raws = [
		new Vertex3D(0, 0, -0.35),
		new Vertex3D(0.2, 0, -0.35),
		new Vertex3D(-0.2, 0, 0),
		new Vertex3D(0, 0.1, -0.2),
		new Vertex3D(0, 0, 0),
		new Vertex3D(0.1, 0.2, -0.35),
	]

	it('should match C++ brute world for all gate types, rotations and twoWay (metal wire regression)', () => {
		const angle = 0.5
		for (const gateType of [1, 2, 3, 4]) {
			for (const rot of [0, -90, -15.2, 34, -50]) {
				for (const twoWay of [true, false]) {
					const { matrix, cx, cy, height, base, scaleZ, len } = captureGateMatrix(angle, {
						gateType,
						rotation: rot,
						twoWay,
					})
					let maxErr = 0
					for (const raw of raws) {
						const cD3d = bruteD3D(raw, len, scaleZ, cx, cy, height, base, rot, angle, twoWay)
						const cWorld = toWorldFromD3D(cD3d)
						const jRh = jsWorldViaUpdater(raw, len, scaleZ, cx, cy, height, base, rot, matrix)
						const jWorld = toWorldFromRH(jRh)
						const err = Math.hypot(cWorld.x - jWorld.x, cWorld.y - jWorld.y, cWorld.z - jWorld.z)
						if (err > maxErr) maxErr = err
					}
					expect(maxErr, `gateType ${gateType} rot ${rot} twoWay ${twoWay} maxErr`).to.be.below(1e-4)
				}
			}
		}
	})

	it('should have small error for current fix and large error for flipped angle (proves test catches sign bug)', () => {
		const angle = 0.5
		const rot = 0
		const twoWay = false
		const raw = new Vertex3D(0, 0, -0.35)
		const { matrix, cx, cy, height, base, scaleZ, len } = captureGateMatrix(angle, {
			gateType: 2,
			rotation: rot,
			twoWay,
		})
		const cD3d = bruteD3D(raw, len, scaleZ, cx, cy, height, base, rot, angle, twoWay)
		const cWorld = toWorldFromD3D(cD3d)
		const jRh = jsWorldViaUpdater(raw, len, scaleZ, cx, cy, height, base, rot, matrix)
		const jWorld = toWorldFromRH(jRh)
		const errCorrect = Math.hypot(cWorld.x - jWorld.x, cWorld.y - jWorld.y, cWorld.z - jWorld.z)
		expect(errCorrect).to.be.below(1e-4)

		const flippedAngle = twoWay ? angle : -angle
		const oppositeIdeal = flippedAngle
		const posZjs = -(height * scaleZ + base)
		const Tneg = new Matrix3D().setTranslation(-cx, -cy, -posZjs)
		const RzNeg = new Matrix3D().rotateZMatrix((-rot * Math.PI) / 180)
		const Rx = new Matrix3D().rotateXMatrix(oppositeIdeal)
		const RzPos = new Matrix3D().rotateZMatrix((rot * Math.PI) / 180)
		const Tpos = new Matrix3D().setTranslation(cx, cy, posZjs)
		const flippedMatrix = Tneg.clone().multiply(RzNeg).multiply(Rx).multiply(RzPos).multiply(Tpos)
		const jRhFlipped = jsWorldViaUpdater(raw, len, scaleZ, cx, cy, height, base, rot, flippedMatrix)
		const jWorldFlipped = toWorldFromRH(jRhFlipped)
		const errFlipped = Math.hypot(
			cWorld.x - jWorldFlipped.x,
			cWorld.y - jWorldFlipped.y,
			cWorld.z - jWorldFlipped.z,
		)
		expect(errFlipped).to.be.above(30)
	})

	it('should match for surface gate (height+base, scaleZ)', async () => {
		const { Table } = await import('../table/table.js')
		const { NodeBinaryReader } = await import('../../io/binary-reader.node.js')
		const table = await Table.load(new NodeBinaryReader('test/fixtures/table-gate.vpx'))
		const gate: any = (table as any).gates.SurfaceGate
		const angle = 0.5
		const scaleZ = table.getScaleZ()
		const base = table.getSurfaceHeight(gate.data.szSurface, gate.data.center.x, gate.data.center.y) * scaleZ
		const api: any = new TestRenderApi()
		let cap: Matrix3D | null = null
		api.applyMatrixToNode = (m: Matrix3D) => {
			cap = m.clone()
		}
		api.findInGroup = () => ({})
		gate.getUpdater().applyState({}, { angle } as GateState, api, table)
		if (!cap) throw new Error('no matrix')
		const cx = gate.data.center.x
		const cy = gate.data.center.y
		const height = gate.data.height
		const len = gate.data.length
		const rot = gate.data.rotation
		const twoWay = gate.data.twoWay
		let maxErr = 0
		for (const raw of raws) {
			const cD3d = bruteD3D(raw, len, scaleZ, cx, cy, height, base, rot, angle, twoWay)
			const cWorld = toWorldFromD3D(cD3d)
			const jRh = jsWorldViaUpdater(raw, len, scaleZ, cx, cy, height, base, rot, cap as Matrix3D)
			const jWorld = toWorldFromRH(jRh)
			const err = Math.hypot(cWorld.x - jWorld.x, cWorld.y - jWorld.y, cWorld.z - jWorld.z)
			if (err > maxErr) maxErr = err
		}
		expect(maxErr).to.be.below(1e-4)
		expect(-(gate.data.height * scaleZ + base)).to.equal(-100)
	})

	it('should move gate bottom in correct world direction (wire vs plate parity)', () => {
		const angle = 0.5
		const rawsBottom = new Vertex3D(0, 0, -0.35)
		for (const gateType of [1, 3]) {
			const { matrix, cx, cy, height, base, scaleZ, len, rot } = captureGateMatrix(angle, {
				gateType,
				rotation: 0,
				twoWay: true,
			})
			const j0 = jsWorldViaUpdater(
				new Vertex3D(0, 0, 0),
				len,
				scaleZ,
				cx,
				cy,
				height,
				base,
				rot,
				new Matrix3D().identity(),
			)
			const jRh = jsWorldViaUpdater(rawsBottom, len, scaleZ, cx, cy, height, base, rot, matrix)
			const jWorld0 = toWorldFromRH(
				jsWorldViaUpdater(
					new Vertex3D(0, 0, -0.35),
					len,
					scaleZ,
					cx,
					cy,
					height,
					base,
					rot,
					new Matrix3D().identity(),
				) as any,
			)
			void j0
			void jWorld0
			const cD3d0 = bruteD3D(rawsBottom, len, scaleZ, cx, cy, height, base, rot, 0, true)
			const cWorld0 = toWorldFromD3D(cD3d0)
			const cD3d = bruteD3D(rawsBottom, len, scaleZ, cx, cy, height, base, rot, angle, true)
			const cWorld = toWorldFromD3D(cD3d)
			const deltaY = cWorld.y - cWorld0.y
			const jWorldBottom0 = toWorldFromRH(
				jsWorldViaUpdater(rawsBottom, len, scaleZ, cx, cy, height, base, rot, new Matrix3D().identity()),
			)
			const jWorldBottom = toWorldFromRH(jRh)
			const jDeltaY = jWorldBottom.y - jWorldBottom0.y
			expect(Math.sign(jDeltaY), `gateType ${gateType} jDeltaY`).to.equal(Math.sign(deltaY))
			expect(jDeltaY).to.be.closeTo(deltaY, 1e-4)
		}
	})
})
