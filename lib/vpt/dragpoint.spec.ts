import { describe, expect, it } from 'vitest'
import { Vertex3D } from '../math/vector.js'
import { CatmullCurve2D } from '../util/catmull-curve.js'
import { RenderVertex } from '../util/vertex.js'
import { DragPoint } from './dragpoint.js'

function dragPoint(
	x: number,
	y: number,
	fields: { smooth?: boolean; autoTexture?: boolean; texturecoord?: number } = {},
): DragPoint {
	const point = new DragPoint()
	point.vertex = new Vertex3D(x, y, 0)
	point.fSmooth = fields.smooth ?? true
	point.fSlingshot = false
	point.fAutoTexture = fields.autoTexture ?? true
	point.texturecoord = fields.texturecoord ?? 0
	return point
}

function square(autoTexture = true): DragPoint[] {
	return [
		dragPoint(0, 0, { smooth: true, autoTexture, texturecoord: 0 }),
		dragPoint(100, 0, { smooth: true, autoTexture, texturecoord: 10 }),
		dragPoint(100, 100, { smooth: true, autoTexture, texturecoord: 20 }),
		dragPoint(0, 100, { smooth: true, autoTexture, texturecoord: 30 }),
	]
}

function corners(autoTexture: boolean): DragPoint[] {
	const texcoords = [0, 0.25, 0.5, 0.75]
	return [
		[0, 0],
		[100, 0],
		[100, 100],
		[0, 100],
	].map(([x, y], i) =>
		dragPoint(x as number, y as number, { smooth: false, autoTexture, texturecoord: texcoords[i] }),
	)
}

function curve(points: DragPoint[], loop: boolean): RenderVertex[] {
	return DragPoint.getRgVertex(points, () => new RenderVertex(), CatmullCurve2D.fromVertex2D, loop, 4.0)
}

describe('DragPoint.getRgVertex', () => {
	it('should subdivide a smooth open curve with control points at the drag points', () => {
		const vv = curve(square(), false)
		expect(vv.length).toBe(39)
		expect(vv.map(v => (v.fControlPoint ? 'C' : '.')).join('')).toBe('C..........C...............C...........')
		const [first, mid, second, third, last] = [vv[0], vv[4], vv[11], vv[27], vv[38]] as RenderVertex[]
		expect([first?.x, first?.y]).toEqual([0, 0])
		expect(first?.fControlPoint).toBe(true)
		// Catmull-Rom overshoots straight segments; the midpoint sags below y=0.
		expect(mid?.x).toBeCloseTo(50, 4)
		expect(mid?.y).toBeCloseTo(-6.25, 4)
		expect(mid?.fControlPoint).toBe(false)
		expect([second?.x, second?.y]).toEqual([100, 0])
		expect(second?.fControlPoint).toBe(true)
		expect([third?.x, third?.y]).toEqual([100, 100])
		expect([last?.x, last?.y]).toEqual([0, 100])
		expect(last?.fControlPoint).toBe(false)
	})

	it('should close a smooth loop with symmetric segments', () => {
		const vv = curve(square(), true)
		expect(vv.length).toBe(64)
		expect(vv.map(v => (v.fControlPoint ? 'C' : '.')).join('')).toBe(
			'C...............C...............C...............C...............',
		)
		const [first, eighth, second, last] = [vv[0], vv[8], vv[16], vv[63]] as RenderVertex[]
		expect([first?.x, first?.y]).toEqual([0, 0])
		expect(eighth?.x).toBeCloseTo(50, 4)
		expect(eighth?.y).toBeCloseTo(-12.5, 4)
		expect([second?.x, second?.y]).toEqual([100, 0])
		expect(second?.fControlPoint).toBe(true)
		expect(last?.x).toBeCloseTo(-2.9297, 4)
		expect(last?.y).toBeCloseTo(3.6865, 4)
	})

	it('should emit only the corners for a non-smooth loop', () => {
		const vv = curve(corners(true), true)
		expect(vv.map(v => [v.x, v.y, v.fControlPoint])).toEqual([
			[0, 0, true],
			[100, 0, true],
			[100, 100, true],
			[0, 100, true],
		])
	})
})

describe('DragPoint.getTextureCoords', () => {
	it('should hit authored coords exactly at control points', () => {
		const points = corners(false)
		const coords = DragPoint.getTextureCoords(points, curve(points, true))
		expect(coords).toHaveLength(4)
		for (const [i, expected] of [0, 0.25, 0.5, 0.75].entries()) {
			expect(coords[i]).toBeCloseTo(expected, 6)
		}
	})

	it('should spread 0..1 across control points without authored coords', () => {
		const points = corners(true)
		const coords = DragPoint.getTextureCoords(points, curve(points, true))
		expect(coords).toHaveLength(4)
		for (const [i, expected] of [0, 0.25, 0.5, 0.75].entries()) {
			expect(coords[i]).toBeCloseTo(expected, 6)
		}
	})

	it('should interpolate along subdivided segments and wrap the last one down', () => {
		const points = square(false)
		const vv = curve(points, true)
		const coords = DragPoint.getTextureCoords(points, vv)
		expect(coords).toHaveLength(vv.length)
		// Control points land exactly on their authored coords.
		expect(coords[0]).toBeCloseTo(0, 6)
		expect(coords[16]).toBeCloseTo(10, 6)
		expect(coords[32]).toBeCloseTo(20, 6)
		expect(coords[48]).toBeCloseTo(30, 6)
		// Interior points interpolate monotonically; the wrap segment runs 30 back toward 0.
		expect(coords[8]).toBeCloseTo(5, 6)
		for (let i = 1; i < 48; i++) {
			expect(coords[i]).toBeGreaterThanOrEqual(coords[i - 1] as number)
		}
		for (let i = 49; i < coords.length; i++) {
			expect(coords[i]).toBeLessThan(coords[i - 1] as number)
		}
		expect(coords[63]).toBeCloseTo(1.3448, 4)
	})
})

describe('DragPoint BIFF tags', () => {
	it('should parse VCEN into the vertex and let POSZ override z', async () => {
		const point = new DragPoint()
		const center = new Uint8Array(12)
		const view = new DataView(center.buffer)
		view.setFloat32(0, 1.5, true)
		view.setFloat32(4, -2.5, true)
		view.setFloat32(8, 30, true)
		await point.fromTag(center, 'VCEN')
		expect([point.vertex.x, point.vertex.y, point.vertex.z]).toEqual([1.5, -2.5, 30])
		const posZ = new Uint8Array(4)
		new DataView(posZ.buffer).setFloat32(0, 77, true)
		await point.fromTag(posZ, 'POSZ')
		expect([point.vertex.x, point.vertex.y, point.vertex.z]).toEqual([1.5, -2.5, 77])
	})
})
