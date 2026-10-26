import { describe, expect, it } from 'vitest'
import { Matrix2D } from './matrix.js'
import { Vertex3D } from './vector.js'

describe('Vertex3D.applyMatrix2D', () => {
	it('applies M*v with rows from set() (upstream Matrix3::operator*)', () => {
		const m = new Matrix2D()
		m.set(1, 2, 3, 4, 5, 6, 7, 8, 9)
		// Row products with (10, 20, 30): 1*10+2*20+3*30, 4*10+5*20+6*30, 7*10+8*20+9*30.
		const out = new Vertex3D(10, 20, 30).applyMatrix2D(m)
		expect(out.x).toBeCloseTo(140, 5)
		expect(out.y).toBeCloseTo(320, 5)
		expect(out.z).toBeCloseTo(500, 5)
	})

	it('rotates by -angle like upstream RotationAroundAxis', () => {
		// Upstream documents "this actually rotates by -angle in right-handed
		// coordinates" (vpinball src/math/matrix.h); the golden below is the
		// Rodrigues rotation of (1, 2, 3) about normalize(0.5, -0.3, 0.2)
		// with sin=-0.6, cos=0.8.
		const axis = new Vertex3D(0.5, -0.3, 0.2).normalize()
		const m = new Matrix2D()
		m.rotationAroundAxis(axis, 0.6, 0.8)
		const out = new Vertex3D(1, 2, 3).applyMatrix2D(m)
		expect(out.x).toBeCloseTo(2.19690603, 5)
		expect(out.y).toBeCloseTo(2.78637972, 5)
		expect(out.z).toBeCloseTo(1.18730449, 5)
		// A rotation preserves length: |(1,2,3)| = sqrt(14).
		expect(out.length()).toBeCloseTo(Math.sqrt(14), 5)
	})
})

describe('Matrix2D.multiplyVectorT', () => {
	it('applies M-transpose*v (upstream MulVectorT)', () => {
		const m = new Matrix2D()
		m.set(1, 2, 3, 4, 5, 6, 7, 8, 9)
		// Column products with (10, 20, 30): 1*10+4*20+7*30, 2*10+5*20+8*30, 3*10+6*20+9*30.
		const out = m.multiplyVectorT(new Vertex3D(10, 20, 30))
		expect(out.x).toBeCloseTo(300, 5)
		expect(out.y).toBeCloseTo(360, 5)
		expect(out.z).toBeCloseTo(420, 5)
	})
})
