// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { describe, expect, it } from 'vitest'
import { TableBuilder } from '../../../test/table-builder.js'
import { TestRenderApi } from '../../../test/test-render-api.js'
import { Player } from '../../game/player.js'
import type { Matrix3D } from '../../util/matrix.js'
import { Vertex3D } from '../../util/vector.js'
import type { PrimitiveState } from './primitive-state.js'

describe('regression: primitive script-animated transforms stay generic and data-immutable', () => {
	it('RotZ via API must update state only and yield non-identity updater delta (flipper regression)', () => {
		const table = new TableBuilder()
			.addPrimitive('pRotZ', {
				rotAndTra: [0, 0, 123.6, 0, 0, 0, 0, 0, 0],
				position: new Vertex3D(100, 200, 10),
				size: new Vertex3D(1, 1, 1),
			})
			.build()
		const player = new Player(table).init()
		const prim = table.primitives.pRotZ
		const api: any = prim.getApi()

		expect(prim.data.rotAndTra[2]).toBeCloseTo(123.6, 0.001)
		api.RotZ = 72.5
		expect(api.RotZ).toBeCloseTo(72.5, 0.001)
		expect(prim.data.rotAndTra[2]).toBeCloseTo(123.6, 0.001)

		api.RotAndTra2 = 80
		expect(prim.data.rotAndTra[2]).toBeCloseTo(123.6, 0.001)
		expect(api.RotZ).toBeCloseTo(80, 0.001)
		api.RotZ = 72.5

		const states = player.popStates()
		const diff = states.getState<PrimitiveState>('pRotZ')
		expect(diff.rotation).toBeDefined()
		expect(diff.rotation!.z).toBeCloseTo(72.5, 0.001)

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
		diff.release()
	})

	it('ObjRotZ via API must not mutate data and must produce rotation delta (prison door regression)', () => {
		const table = new TableBuilder()
			.addPrimitive('pObj', {
				rotAndTra: [0, 0, 0, 0, 0, 0, 0, 0, 0],
				position: new Vertex3D(0, 0, 0),
				size: new Vertex3D(1, 1, 1),
			})
			.build()
		const player = new Player(table).init()
		const prim = table.primitives.pObj
		const api: any = prim.getApi()
		expect(prim.data.rotAndTra[8]).toBeCloseTo(0, 0.001)
		api.ObjRotZ = 96
		expect(api.ObjRotZ).toBeCloseTo(96, 0.001)
		expect(prim.data.rotAndTra[8]).toBeCloseTo(0, 0.001)
		api.RotAndTra8 = 45
		expect(prim.data.rotAndTra[8]).toBeCloseTo(0, 0.001)
		expect(api.ObjRotZ).toBeCloseTo(45, 0.001)
		api.ObjRotZ = 96

		const states = player.popStates()
		const diff = states.getState<PrimitiveState>('pObj')
		expect(diff.objectRotation).toBeDefined()
		expect(diff.objectRotation!.z).toBeCloseTo(96, 0.001)

		const renderApi = new TestRenderApi()
		let captured: Matrix3D | null = null
		const orig = renderApi.applyMatrixToNode.bind(renderApi)
		renderApi.applyMatrixToNode = ((m: Matrix3D, n: unknown) => {
			captured = (m as Matrix3D).clone() as Matrix3D
			return orig(m as any, n as any)
		}) as any
		prim.getUpdater().applyState({} as any, diff as any, renderApi as any, table)
		const e = (captured as Matrix3D).elements
		const c = Math.cos((96 * Math.PI) / 180)
		const s = Math.sin((96 * Math.PI) / 180)
		expect(e[0]).toBeCloseTo(c, 0.02)
		expect(e[1]).toBeCloseTo(s, 0.02)
		diff.release()
	})

	it('TransY/X/Z via API must stay data-immutable and contribute to delta translation', () => {
		const table = new TableBuilder()
			.addPrimitive('pTrans', {
				rotAndTra: [0, 0, 0, 5, 7, 9, 0, 0, 0],
				position: new Vertex3D(0, 0, 0),
				size: new Vertex3D(1, 1, 1),
			})
			.build()
		const player = new Player(table).init()
		const prim = table.primitives.pTrans
		const api: any = prim.getApi()
		expect(prim.data.rotAndTra[3]).toBeCloseTo(5, 0.001)
		expect(prim.data.rotAndTra[4]).toBeCloseTo(7, 0.001)
		expect(prim.data.rotAndTra[5]).toBeCloseTo(9, 0.001)
		api.TransX = 50
		api.TransY = -12
		api.TransZ = 99
		expect(prim.data.rotAndTra[3]).toBeCloseTo(5, 0.001)
		expect(prim.data.rotAndTra[4]).toBeCloseTo(7, 0.001)
		expect(prim.data.rotAndTra[5]).toBeCloseTo(9, 0.001)
		expect(api.TransX).toBeCloseTo(50, 0.001)
		expect(api.TransY).toBeCloseTo(-12, 0.001)
		expect(api.TransZ).toBeCloseTo(99, 0.001)

		const states = player.popStates()
		const diff = states.getState<PrimitiveState>('pTrans')
		expect(diff.translation).toBeDefined()
		expect(diff.translation!.x).toBeCloseTo(50, 0.001)
		expect(diff.translation!.y).toBeCloseTo(-12, 0.001)
		expect(diff.translation!.z).toBeCloseTo(99, 0.001)

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
		const isIdentity =
			e[0] === 1 && e[1] === 0 && e[4] === 0 && e[5] === 1 && e[12] === 0 && e[13] === 0 && e[14] === 0
		expect(isIdentity).toBe(false)
		diff.release()
	})

	it('X/Y/Z and Size_* via API must not mutate PrimitiveData position/size', () => {
		const table = new TableBuilder()
			.addPrimitive('pPos', {
				position: new Vertex3D(10, 20, 30),
				size: new Vertex3D(2, 3, 4),
				rotAndTra: [0, 0, 0, 0, 0, 0, 0, 0, 0],
			})
			.build()
		const player = new Player(table).init()
		const prim = table.primitives.pPos
		const api: any = prim.getApi()
		const dataPosX = prim.data.position.x
		const dataPosY = prim.data.position.y
		const dataPosZ = prim.data.position.z
		const dataSizeX = prim.data.size.x
		api.X = 111
		api.Y = 222
		api.Z = 333
		api.Size_X = 9
		api.Size_Y = 8
		api.Size_Z = 7
		expect(prim.data.position.x).toBeCloseTo(dataPosX, 0.001)
		expect(prim.data.position.y).toBeCloseTo(dataPosY, 0.001)
		expect(prim.data.position.z).toBeCloseTo(dataPosZ, 0.001)
		expect(prim.data.size.x).toBeCloseTo(dataSizeX, 0.001)
		expect(api.X).toBeCloseTo(111, 0.001)
		expect(api.Size_Z).toBeCloseTo(7, 0.001)

		const states = player.popStates()
		const diff = states.getState<PrimitiveState>('pPos')
		expect(diff.position).toBeDefined()
		expect(diff.size).toBeDefined()
		expect(diff.position!.x).toBeCloseTo(111, 0.001)
		expect(diff.size!.z).toBeCloseTo(7, 0.001)
		diff.release()
	})

	it('all RotAndTra0..8 aliases preserve base data for generic script animations', () => {
		const table = new TableBuilder()
			.addPrimitive('pAll', {
				rotAndTra: [11, 22, 33, 44, 55, 66, 77, 88, 99],
				position: new Vertex3D(0, 0, 0),
				size: new Vertex3D(1, 1, 1),
			})
			.build()
		const player = new Player(table).init()
		const prim = table.primitives.pAll
		const api: any = prim.getApi()
		api.RotX = 1
		api.RotY = 2
		api.RotZ = 3
		api.TransX = 4
		api.TransY = 5
		api.TransZ = 6
		api.ObjRotX = 7
		api.ObjRotY = 8
		api.ObjRotZ = 9
		expect(prim.data.rotAndTra).toEqual([11, 22, 33, 44, 55, 66, 77, 88, 99])
		const states = player.popStates()
		const diff = states.getState<PrimitiveState>('pAll')
		expect(diff.rotation!.x).toBeCloseTo(1, 0.001)
		expect(diff.rotation!.y).toBeCloseTo(2, 0.001)
		expect(diff.rotation!.z).toBeCloseTo(3, 0.001)
		expect(diff.translation!.x).toBeCloseTo(4, 0.001)
		expect(diff.translation!.y).toBeCloseTo(5, 0.001)
		expect(diff.translation!.z).toBeCloseTo(6, 0.001)
		expect(diff.objectRotation!.x).toBeCloseTo(7, 0.001)
		expect(diff.objectRotation!.y).toBeCloseTo(8, 0.001)
		expect(diff.objectRotation!.z).toBeCloseTo(9, 0.001)
		diff.release()
	})
})
