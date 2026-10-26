import { describe, expect, it } from 'vitest'
import { TableBuilder } from '../../../test/table-builder.js'
import { TestRenderApi } from '../../../test/test-render-api.js'
import { Player } from '../../game/player.js'
import type { Matrix3D } from '../../math/matrix.js'
import { Vertex2D, Vertex3D } from '../../math/vector.js'
import type { Primitive } from '../primitive/primitive.js'
import type { PrimitiveState } from '../primitive/primitive-state.js'
import type { Table } from './table.js'

const REST_ANGLE = 123.6
const SWING_ANGLE = 90

function buildFlipperBatTable(): Table {
	return new TableBuilder()
		.addFlipper('LeftFlipper', { center: new Vertex2D(500, 500), startAngle: REST_ANGLE })
		.addPrimitive('BatLeft', {
			rotAndTra: [0, 0, 0, 0, 0, 0, 0, 0, REST_ANGLE],
			position: new Vertex3D(505, 503, 10),
			size: new Vertex3D(1, 1, 1),
			staticRendering: false,
		})
		.build()
}

function captureUpdaterDelta(table: Table, prim: Primitive, player: Player): Matrix3D | null {
	const states = player.popStates()
	const diff = states.getState<PrimitiveState>('BatLeft')
	const renderApi = new TestRenderApi()
	let captured: Matrix3D | null = null
	const orig = renderApi.applyMatrixToNode.bind(renderApi)
	renderApi.applyMatrixToNode = ((matrix: Matrix3D, node: unknown) => {
		captured = matrix.clone() as Matrix3D
		return orig(matrix as any, node as any)
	}) as any
	prim.getUpdater().applyState({} as any, diff as any, renderApi as any, table)
	diff.release()
	return captured
}

describe('flipper-bat primitives keep upstream rotation semantics (no load-time remap)', () => {
	it('Table load preserves bat rotAndTra slots verbatim', () => {
		const table = buildFlipperBatTable()
		const prim = table.primitives.BatLeft
		expect(prim.data.rotAndTra).toEqual([0, 0, 0, 0, 0, 0, 0, 0, REST_ANGLE])
		expect(prim.getState().rotation.z).toBeCloseTo(0, 3)
		expect(prim.getState().objectRotation.z).toBeCloseTo(REST_ANGLE, 3)
	})

	it('script clear-and-drive at rest yields identity updater delta (no jump, no double)', () => {
		const table = buildFlipperBatTable()
		const prim = table.primitives.BatLeft
		const player = new Player(table).init()
		const api = prim.getApi() as unknown as Record<string, number>
		api.ObjRotZ = 0
		api.RotZ = REST_ANGLE
		const captured = captureUpdaterDelta(table, prim, player)
		expect(captured).not.toBeNull()
		const elements = (captured as Matrix3D).elements
		expect(elements[0]).toBeCloseTo(1, 3)
		expect(elements[1]).toBeCloseTo(0, 3)
		expect(elements[4]).toBeCloseTo(0, 3)
		expect(elements[5]).toBeCloseTo(1, 3)
	})

	it('mid-swing drive renders the absolute upstream angle', () => {
		const table = buildFlipperBatTable()
		const prim = table.primitives.BatLeft
		const player = new Player(table).init()
		const api = prim.getApi() as unknown as Record<string, number>
		api.ObjRotZ = 0
		api.RotZ = SWING_ANGLE
		const captured = captureUpdaterDelta(table, prim, player)
		expect(captured).not.toBeNull()
		const elements = (captured as Matrix3D).elements
		const rendered = REST_ANGLE + (Math.atan2(elements[1], elements[0]) * 180) / Math.PI
		expect(rendered).toBeCloseTo(SWING_ANGLE, 2)
	})
})
