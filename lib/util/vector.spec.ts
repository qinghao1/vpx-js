import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { Matrix2D, Vertex3D } from './math.js'

describe('Vertex3D.applyMatrix2D', () => {
	it('matches THREE Matrix3 * Vector3 (row-major correct)', () => {
		const m = new Matrix2D()
		m.set(1, 2, 3, 4, 5, 6, 7, 8, 9)
		const v = new Vertex3D(10, 20, 30)
		const e = (m as unknown as { elements: number[] }).elements
		const expected = new Vector3(
			e[0] * 10 + e[3] * 20 + e[6] * 30,
			e[1] * 10 + e[4] * 20 + e[7] * 30,
			e[2] * 10 + e[5] * 20 + e[8] * 30,
		)
		const out = v.clone(true).applyMatrix2D(m)
		expect(out.x).toBeCloseTo(expected.x, 5)
		expect(out.y).toBeCloseTo(expected.y, 5)
		expect(out.z).toBeCloseTo(expected.z, 5)
	})

	it('matches vpinball Matrix3::operator* (row-major)', () => {
		const axis = new Vertex3D(0.5, -0.3, 0.2).normalize()
		const s = 0.6,
			c = 0.8
		const m = new Matrix2D()
		m.rotationAroundAxis(axis, s, c)
		const v = new Vertex3D(1, 2, 3)
		const e = (m as unknown as { elements: number[] }).elements
		const rowMajorX = e[0] * v.x + e[3] * v.y + e[6] * v.z
		const rowMajorY = e[1] * v.x + e[4] * v.y + e[7] * v.z
		const rowMajorZ = e[2] * v.x + e[5] * v.y + e[8] * v.z
		const out = v.clone(true).applyMatrix2D(m)
		expect(out.x).toBeCloseTo(rowMajorX, 5)
		expect(out.y).toBeCloseTo(rowMajorY, 5)
		expect(out.z).toBeCloseTo(rowMajorZ, 5)
	})
})

describe('Matrix2D.multiplyVectorT', () => {
	it('is transpose of applyMatrix2D (MulVectorT)', () => {
		const m = new Matrix2D()
		m.set(1, 2, 3, 4, 5, 6, 7, 8, 9)
		const v = new Vertex3D(10, 20, 30)
		const e = (m as unknown as { elements: number[] }).elements
		const transposed = new Vertex3D(
			e[0] * v.x + e[1] * v.y + e[2] * v.z,
			e[3] * v.x + e[4] * v.y + e[5] * v.z,
			e[6] * v.x + e[7] * v.y + e[8] * v.z,
		)
		const out = m.multiplyVectorT(v)
		expect(out.x).toBeCloseTo(transposed.x, 5)
		expect(out.y).toBeCloseTo(transposed.y, 5)
		expect(out.z).toBeCloseTo(transposed.z, 5)
	})
})
