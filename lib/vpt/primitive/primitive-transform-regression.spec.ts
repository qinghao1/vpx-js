// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { MathUtils } from 'three'
import { describe, expect, it } from 'vitest'
import {
	rowClose,
	rowMul,
	rowRotateX,
	rowRotateY,
	rowRotateZ,
	rowScale,
	rowTranslate,
	toRow,
} from '../../../test/row-matrix.js'
import { TableBuilder } from '../../../test/table-builder.js'
import { TestRenderApi } from '../../../test/test-render-api.js'
import { Matrix3D } from '../../math/matrix.js'
import { Vertex3D } from '../../math/vector.js'
import type { PrimitiveState } from './primitive-state.js'

describe('regression: primitive script-animated transforms stay generic and data-immutable', () => {
	it('RotZ state must leave data alone and yield non-identity updater delta (flipper regression)', () => {
		const table = new TableBuilder()
			.addPrimitive('pRotZ', {
				rotAndTra: [0, 0, 123.6, 0, 0, 0, 0, 0, 0],
				position: new Vertex3D(100, 200, 10),
				size: new Vertex3D(1, 1, 1),
			})
			.build()
		const prim = table.primitives.pRotZ

		expect(prim.data.rotAndTra[2]).toBeCloseTo(123.6, 0.001)
		const diff = { rotation: new Vertex3D(0, 0, 72.5) } as PrimitiveState

		const renderApi = new TestRenderApi()
		let captured: Matrix3D | null = null
		const orig = renderApi.applyMatrixToNode.bind(renderApi)
		renderApi.applyMatrixToNode = ((m: Matrix3D, n: unknown) => {
			captured = (m as Matrix3D).clone() as Matrix3D
			return orig(m as any, n as any)
		}) as any
		prim.getUpdater().applyState({} as any, diff as any, renderApi as any, table)
		expect(captured).not.toBeNull()
		const e = (captured as Matrix3D).elements
		const expectedCos = Math.cos((-51.1 * Math.PI) / 180)
		const expectedSin = Math.sin((-51.1 * Math.PI) / 180)
		expect(e[0]).toBeCloseTo(expectedCos, 0.03)
		expect(e[1]).toBeCloseTo(expectedSin, 0.03)
		expect(e[4]).toBeCloseTo(-expectedSin, 0.03)
		expect(e[5]).toBeCloseTo(expectedCos, 0.03)
		expect(Math.abs(e[0] - 1) > 0.05 || Math.abs(e[1]) > 0.01).toBe(true)
	})

	it('ObjRotZ state must not mutate data and must produce rotation delta (prison door regression)', () => {
		const table = new TableBuilder()
			.addPrimitive('pObj', {
				rotAndTra: [0, 0, 0, 0, 0, 0, 0, 0, 0],
				position: new Vertex3D(0, 0, 0),
				size: new Vertex3D(1, 1, 1),
			})
			.build()
		const prim = table.primitives.pObj
		expect(prim.data.rotAndTra[8]).toBeCloseTo(0, 0.001)

		const diff = { objectRotation: new Vertex3D(0, 0, 96) } as PrimitiveState

		const renderApi = new TestRenderApi()
		let captured: Matrix3D | null = null
		const orig = renderApi.applyMatrixToNode.bind(renderApi)
		renderApi.applyMatrixToNode = ((m: Matrix3D, n: unknown) => {
			captured = (m as Matrix3D).clone() as Matrix3D
			return orig(m as any, n as any)
		}) as any
		prim.getUpdater().applyState({} as any, diff as any, renderApi as any, table)
		expect(prim.data.rotAndTra[8]).toBeCloseTo(0, 0.001)
		const e = (captured as Matrix3D).elements
		const c = Math.cos((96 * Math.PI) / 180)
		const s = Math.sin((96 * Math.PI) / 180)
		expect(e[0]).toBeCloseTo(c, 0.02)
		expect(e[1]).toBeCloseTo(s, 0.02)
	})

	it('TransY/X/Z state must stay data-immutable and contribute to delta translation', () => {
		const table = new TableBuilder()
			.addPrimitive('pTrans', {
				rotAndTra: [0, 0, 0, 5, 7, 9, 0, 0, 0],
				position: new Vertex3D(0, 0, 0),
				size: new Vertex3D(1, 1, 1),
			})
			.build()
		const prim = table.primitives.pTrans
		expect(prim.data.rotAndTra[3]).toBeCloseTo(5, 0.001)
		expect(prim.data.rotAndTra[4]).toBeCloseTo(7, 0.001)
		expect(prim.data.rotAndTra[5]).toBeCloseTo(9, 0.001)

		const diff = { translation: new Vertex3D(50, -12, 99) } as PrimitiveState

		const renderApi = new TestRenderApi()
		let captured: Matrix3D | null = null
		const orig = renderApi.applyMatrixToNode.bind(renderApi)
		renderApi.applyMatrixToNode = ((m: Matrix3D, n: unknown) => {
			captured = (m as Matrix3D).clone() as Matrix3D
			return orig(m as any, n as any)
		}) as any
		prim.getUpdater().applyState({} as any, diff as any, renderApi as any, table)
		expect(prim.data.rotAndTra[3]).toBeCloseTo(5, 0.001)
		expect(prim.data.rotAndTra[4]).toBeCloseTo(7, 0.001)
		expect(prim.data.rotAndTra[5]).toBeCloseTo(9, 0.001)
		expect(captured).not.toBeNull()
		const e = (captured as Matrix3D).elements
		const isIdentity =
			e[0] === 1 && e[1] === 0 && e[4] === 0 && e[5] === 1 && e[12] === 0 && e[13] === 0 && e[14] === 0
		expect(isIdentity).toBe(false)
	})

	it('X/Y/Z and Size_* state must not mutate PrimitiveData position/size', () => {
		const table = new TableBuilder()
			.addPrimitive('pPos', {
				position: new Vertex3D(10, 20, 30),
				size: new Vertex3D(2, 3, 4),
				rotAndTra: [0, 0, 0, 0, 0, 0, 0, 0, 0],
			})
			.build()
		const prim = table.primitives.pPos
		const dataPosX = prim.data.position.x
		const dataPosY = prim.data.position.y
		const dataPosZ = prim.data.position.z
		const dataSizeX = prim.data.size.x

		const diff = {
			position: new Vertex3D(111, 222, 333),
			size: new Vertex3D(9, 8, 7),
		} as PrimitiveState
		prim.getUpdater().applyState({} as any, diff as any, new TestRenderApi() as any, table)
		expect(prim.data.position.x).toBeCloseTo(dataPosX, 0.001)
		expect(prim.data.position.y).toBeCloseTo(dataPosY, 0.001)
		expect(prim.data.position.z).toBeCloseTo(dataPosZ, 0.001)
		expect(prim.data.size.x).toBeCloseTo(dataSizeX, 0.001)
		expect(prim.getState().position!.x).toBeCloseTo(111, 0.001)
		expect(prim.getState().size!.z).toBeCloseTo(7, 0.001)
	})

	it('all rotation/translation state aliases preserve base data for generic animations', () => {
		const table = new TableBuilder()
			.addPrimitive('pAll', {
				rotAndTra: [11, 22, 33, 44, 55, 66, 77, 88, 99],
				position: new Vertex3D(0, 0, 0),
				size: new Vertex3D(1, 1, 1),
			})
			.build()
		const prim = table.primitives.pAll
		const diff = {
			rotation: new Vertex3D(1, 2, 3),
			translation: new Vertex3D(4, 5, 6),
			objectRotation: new Vertex3D(7, 8, 9),
		} as PrimitiveState
		prim.getUpdater().applyState({} as any, diff as any, new TestRenderApi() as any, table)
		expect(prim.data.rotAndTra).toEqual([11, 22, 33, 44, 55, 66, 77, 88, 99])
		expect(prim.getState().rotation!.x).toBeCloseTo(1, 0.001)
		expect(prim.getState().rotation!.y).toBeCloseTo(2, 0.001)
		expect(prim.getState().rotation!.z).toBeCloseTo(3, 0.001)
		expect(prim.getState().translation!.x).toBeCloseTo(4, 0.001)
		expect(prim.getState().translation!.y).toBeCloseTo(5, 0.001)
		expect(prim.getState().translation!.z).toBeCloseTo(6, 0.001)
		expect(prim.getState().objectRotation!.x).toBeCloseTo(7, 0.001)
		expect(prim.getState().objectRotation!.y).toBeCloseTo(8, 0.001)
		expect(prim.getState().objectRotation!.z).toBeCloseTo(9, 0.001)
	})
})

describe('primitive RecalculateMatrices composition', () => {
	it('matches upstream scale * rotTrans * translation order', () => {
		const size = { x: 2, y: 3, z: 4 }
		const pos = { x: 10, y: 20, z: 5 }
		// Packed transform: rotation XYZ (degrees), translation XYZ, second rotation XYZ (degrees).
		const [rx1 = 0, ry1 = 0, rz1 = 0, tx = 0, ty = 0, tz = 0, rx2 = 0, ry2 = 0, rz2 = 0] = [
			10, 20, 30, 1, 2, 3, 40, 50, 60,
		]
		const rotTrans = new Matrix3D().setTranslation(tx, ty, tz)
		rotTrans.multiply(new Matrix3D().rotateZMatrix(MathUtils.degToRad(rz1)))
		rotTrans.multiply(new Matrix3D().rotateYMatrix(MathUtils.degToRad(ry1)))
		rotTrans.multiply(new Matrix3D().rotateXMatrix(MathUtils.degToRad(rx1)))
		rotTrans.multiply(new Matrix3D().rotateZMatrix(MathUtils.degToRad(rz2)))
		rotTrans.multiply(new Matrix3D().rotateYMatrix(MathUtils.degToRad(ry2)))
		rotTrans.multiply(new Matrix3D().rotateXMatrix(MathUtils.degToRad(rx2)))
		const full = new Matrix3D()
			.setScaling(size.x, size.y, size.z)
			.multiply(rotTrans)
			.multiply(new Matrix3D().setTranslation(pos.x, pos.y, pos.z))
		const RT = rowMul(
			rowMul(
				rowMul(
					rowMul(
						rowMul(
							rowMul(rowTranslate(tx, ty, tz), rowRotateZ(MathUtils.degToRad(rz1))),
							rowRotateY(MathUtils.degToRad(ry1)),
						),
						rowRotateX(MathUtils.degToRad(rx1)),
					),
					rowRotateZ(MathUtils.degToRad(rz2)),
				),
				rowRotateY(MathUtils.degToRad(ry2)),
			),
			rowRotateX(MathUtils.degToRad(rx2)),
		)
		const ref = rowMul(rowMul(rowScale(size.x, size.y, size.z), RT), rowTranslate(pos.x, pos.y, pos.z))
		expect(rowClose(toRow(full), ref)).toBe(true)
	})
})
