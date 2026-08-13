// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { TableBuilder } from '../../../test/table-builder.js'
import { TestRenderApi } from '../../../test/test-render-api.js'
import { Matrix3D } from '../../util/matrix.js'
import { Vertex3D } from '../../util/vector.js'
import { SpinnerMeshGenerator } from './spinner-mesh-generator.js'
import type { SpinnerState } from './spinner-state.js'

chai.use((sinonChai as any).default ?? sinonChai)

const RIGHT_HANDED = new Matrix3D().setScaling(1, 1, -1)

function toWorldFromD3D(p: Vertex3D): Vertex3D {
	return new Vertex3D(p.x, p.z, p.y)
}

function toWorldFromRH(p: Vertex3D): Vertex3D {
	return new Vertex3D(p.x, -p.z, p.y)
}

function bruteSpinnerD3D(
	raw: Vertex3D,
	len: number,
	_scaleZ: number,
	cx: number,
	cy: number,
	posZ: number,
	rotDeg: number,
	angle: number,
): Vertex3D {
	const rot = (rotDeg * Math.PI) / 180
	const full = new Matrix3D().rotateXMatrix(-angle).multiply(new Matrix3D().rotateZMatrix(rot))
	const vert = full
		.clone()
		.multiply(new Matrix3D().setScaling(len, len, len))
		.multiply(new Matrix3D().setTranslation(cx, cy, posZ))
	return new Vertex3D(raw.x, raw.y, raw.z).multiplyMatrix(vert)
}

function jsSpinnerWorld(
	raw: Vertex3D,
	len: number,
	scaleZ: number,
	cx: number,
	cy: number,
	posZ: number,
	rotDeg: number,
	updaterMatrix: Matrix3D,
): Vertex3D {
	const rot = (rotDeg * Math.PI) / 180
	const mRz = new Matrix3D().rotateZMatrix(rot)
	const Slen = new Matrix3D().setScaling(len, len, len * scaleZ)
	const Tworld = new Matrix3D().setTranslation(cx, cy, posZ)
	const staticMat = mRz.clone().multiply(Slen).multiply(Tworld)
	const staticWithHand = staticMat.clone().multiply(RIGHT_HANDED)
	const total = staticWithHand.clone().multiply(updaterMatrix)
	return new Vertex3D(raw.x, raw.y, raw.z).multiplyMatrix(total)
}

function captureSpinnerMatrix(
	angle: number,
	rotation = 0,
): { matrix: Matrix3D; cx: number; cy: number; posZ: number; scaleZ: number; len: number; rot: number } {
	const table = new TableBuilder().addSpinner('s', { rotation } as any).build()
	const spinner: any = table.spinners.s
	spinner.data.center.x = 500
	spinner.data.center.y = 500
	const scaleZ = table.getScaleZ()
	const gen = new SpinnerMeshGenerator(spinner.data)
	const posZ = gen.getZ(table)
	const api: any = new TestRenderApi()
	let cap: Matrix3D | null = null
	api.applyMatrixToNode = (m: Matrix3D) => {
		cap = m.clone()
	}
	api.findInGroup = () => ({})
	spinner.getUpdater().applyState({}, { angle } as SpinnerState, api, table)
	if (!cap) throw new Error('no matrix')
	return {
		matrix: cap as Matrix3D,
		cx: spinner.data.center.x,
		cy: spinner.data.center.y,
		posZ,
		scaleZ,
		len: spinner.data.length,
		rot: spinner.data.rotation,
	}
}

describe('Spinner visual regression vs VPinball C++ brute', () => {
	const raws = [
		new Vertex3D(0, 0, 0.2),
		new Vertex3D(0.2, 0, 0.1),
		new Vertex3D(0, 0.1, -0.1),
		new Vertex3D(0, 0, 0),
		new Vertex3D(0.1, 0.2, 0.3),
	]

	it('should match C++ brute world for spinner (all rotations)', () => {
		const angle = 0.6
		for (const rot of [0, -90, 30, 15.2]) {
			const { matrix, cx, cy, posZ, scaleZ, len } = captureSpinnerMatrix(angle, rot)
			let maxErr = 0
			for (const raw of raws) {
				const cD3d = bruteSpinnerD3D(raw, len, scaleZ, cx, cy, posZ, rot, angle)
				const cWorld = toWorldFromD3D(cD3d)
				const jRh = jsSpinnerWorld(raw, len, scaleZ, cx, cy, posZ, rot, matrix)
				const jWorld = toWorldFromRH(jRh)
				const err = Math.hypot(cWorld.x - jWorld.x, cWorld.y - jWorld.y, cWorld.z - jWorld.z)
				if (err > maxErr) maxErr = err
			}
			expect(maxErr, `rot ${rot}`).to.be.below(1e-4)
		}
	})

	it('should catch flipped sign (angle = -state.angle with +posZ)', () => {
		const angle = 0.5
		const rot = 15
		const raw = new Vertex3D(0, 0, 0.2)
		const { matrix, cx, cy, posZ, scaleZ, len } = captureSpinnerMatrix(angle, rot)
		const cD3d = bruteSpinnerD3D(raw, len, scaleZ, cx, cy, posZ, rot, angle)
		const cWorld = toWorldFromD3D(cD3d)
		const jRh = jsSpinnerWorld(raw, len, scaleZ, cx, cy, posZ, rot, matrix)
		const jWorld = toWorldFromRH(jRh)
		const errCorrect = Math.hypot(cWorld.x - jWorld.x, cWorld.y - jWorld.y, cWorld.z - jWorld.z)
		expect(errCorrect).to.be.below(1e-4)

		const posZjsFlipped = posZ
		const Tneg = new Matrix3D().setTranslation(-cx, -cy, -posZjsFlipped)
		const RzNeg = new Matrix3D().rotateZMatrix((-rot * Math.PI) / 180)
		const Rx = new Matrix3D().rotateXMatrix(-angle)
		const RzPos = new Matrix3D().rotateZMatrix((rot * Math.PI) / 180)
		const Tpos = new Matrix3D().setTranslation(cx, cy, posZjsFlipped)
		const flipped = Tneg.clone().multiply(RzNeg).multiply(Rx).multiply(RzPos).multiply(Tpos)
		const jRhFlipped = jsSpinnerWorld(raw, len, scaleZ, cx, cy, posZ, rot, flipped)
		const jWorldFlipped = toWorldFromRH(jRhFlipped)
		const errFlipped = Math.hypot(
			cWorld.x - jWorldFlipped.x,
			cWorld.y - jWorldFlipped.y,
			cWorld.z - jWorldFlipped.z,
		)
		expect(errFlipped).to.be.above(5)
	})

	it('should match for fixture table', async () => {
		const { Table } = await import('../table/table.js')
		const { NodeBinaryReader } = await import('../../io/binary-reader.node.js')
		const table = await Table.load(new NodeBinaryReader('test/fixtures/table-gate.vpx'))
		const spinner: any = Object.values(table.spinners)[0] ?? {
			data: { center: { x: 500, y: 500 }, rotation: 0, height: 60, length: 80 },
		}
		if (!table.spinners || Object.keys(table.spinners).length === 0) {
			const { matrix, cx, cy, posZ, scaleZ, len, rot } = captureSpinnerMatrix(0.4, 0)
			let maxErr = 0
			for (const raw of raws) {
				const cD3d = bruteSpinnerD3D(raw, len, scaleZ, cx, cy, posZ, rot, 0.4)
				const cWorld = toWorldFromD3D(cD3d)
				const jRh = jsSpinnerWorld(raw, len, scaleZ, cx, cy, posZ, rot, matrix)
				const jWorld = toWorldFromRH(jRh)
				const err = Math.hypot(cWorld.x - jWorld.x, cWorld.y - jWorld.y, cWorld.z - jWorld.z)
				if (err > maxErr) maxErr = err
			}
			expect(maxErr).to.be.below(1e-4)
			return
		}
		const s = spinner
		const angle = 0.4
		const scaleZ = table.getScaleZ()
		const gen = new SpinnerMeshGenerator(s.data)
		const posZ = gen.getZ(table)
		const api: any = new TestRenderApi()
		let cap: Matrix3D | null = null
		api.applyMatrixToNode = (m: Matrix3D) => {
			cap = m.clone()
		}
		api.findInGroup = () => ({})
		s.getUpdater().applyState({}, { angle } as SpinnerState, api, table)
		if (!cap) throw new Error('no matrix')
		let maxErr = 0
		for (const raw of raws) {
			const cD3d = bruteSpinnerD3D(
				raw,
				s.data.length,
				scaleZ,
				s.data.center.x,
				s.data.center.y,
				posZ,
				s.data.rotation,
				angle,
			)
			const cWorld = toWorldFromD3D(cD3d)
			const jRh = jsSpinnerWorld(
				raw,
				s.data.length,
				scaleZ,
				s.data.center.x,
				s.data.center.y,
				posZ,
				s.data.rotation,
				cap as Matrix3D,
			)
			const jWorld = toWorldFromRH(jRh)
			const err = Math.hypot(cWorld.x - jWorld.x, cWorld.y - jWorld.y, cWorld.z - jWorld.z)
			if (err > maxErr) maxErr = err
		}
		expect(maxErr).to.be.below(1e-4)
	})
})
