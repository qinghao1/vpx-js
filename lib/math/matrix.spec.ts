import { MathUtils } from 'three'
import { describe, expect, it } from 'vitest'
import { Matrix2D, Matrix3D } from './matrix.js'
import { Vertex3D } from './vector.js'

type Row4 = number[][]

const rowIdentity = (): Row4 => [
	[1, 0, 0, 0],
	[0, 1, 0, 0],
	[0, 0, 1, 0],
	[0, 0, 0, 1],
]
const rowTranslate = (x: number, y: number, z: number): Row4 => [
	[1, 0, 0, 0],
	[0, 1, 0, 0],
	[0, 0, 1, 0],
	[x, y, z, 1],
]
const rowScale = (sx: number, sy: number, sz: number): Row4 => [
	[sx, 0, 0, 0],
	[0, sy, 0, 0],
	[0, 0, sz, 0],
	[0, 0, 0, 1],
]
const rowRotateX = (a: number): Row4 => {
	const c = Math.cos(a),
		s = Math.sin(a)
	return [
		[1, 0, 0, 0],
		[0, c, s, 0],
		[0, -s, c, 0],
		[0, 0, 0, 1],
	]
}
const rowRotateY = (a: number): Row4 => {
	const c = Math.cos(a),
		s = Math.sin(a)
	return [
		[c, 0, -s, 0],
		[0, 1, 0, 0],
		[s, 0, c, 0],
		[0, 0, 0, 1],
	]
}
const rowRotateZ = (a: number): Row4 => {
	const c = Math.cos(a),
		s = Math.sin(a)
	return [
		[c, s, 0, 0],
		[-s, c, 0, 0],
		[0, 0, 1, 0],
		[0, 0, 0, 1],
	]
}
const rowMul = (A: Row4, B: Row4): Row4 => {
	const C = rowIdentity()
	for (let i = 0; i < 4; i++)
		for (let j = 0; j < 4; j++) {
			let s = 0
			for (let k = 0; k < 4; k++) s += A[i][k] * B[k][j]
			C[i][j] = s
		}
	return C
}
const toRow = (m: Matrix3D): Row4 => [
	[m._11, m._12, m._13, m._14],
	[m._21, m._22, m._23, m._24],
	[m._31, m._32, m._33, m._34],
	[m._41, m._42, m._43, m._44],
]
const rowClose = (a: Row4, b: Row4, eps = 1e-5): boolean => {
	for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (Math.abs(a[i][j] - b[i][j]) > eps) return false
	return true
}

describe('Matrix3D D3D row semantics', () => {
	it('identity', () => {
		expect(rowClose(toRow(new Matrix3D().identity()), rowIdentity())).toBe(true)
	})
	it('translation', () => {
		expect(rowClose(toRow(new Matrix3D().setTranslation(10, 20, 30)), rowTranslate(10, 20, 30))).toBe(true)
	})
	it('scaling', () => {
		const m = new Matrix3D().setScaling(2, 3, 4)
		expect(rowClose(toRow(m), rowScale(2, 3, 4))).toBe(true)
	})
	it('rotateX matches D3D SetRotateX', () => {
		const a = MathUtils.degToRad(30)
		expect(rowClose(toRow(new Matrix3D().rotateXMatrix(a)), rowRotateX(a))).toBe(true)
	})
	it('rotateY matches D3D SetRotateY', () => {
		const a = MathUtils.degToRad(45)
		expect(rowClose(toRow(new Matrix3D().rotateYMatrix(a)), rowRotateY(a))).toBe(true)
	})
	it('rotateZ matches D3D SetRotateZ', () => {
		const a = MathUtils.degToRad(60)
		expect(rowClose(toRow(new Matrix3D().rotateZMatrix(a)), rowRotateZ(a))).toBe(true)
	})

	it('multiply is row A*B (translate*scale scales translation)', () => {
		const tr = new Matrix3D().setTranslation(5, 0, 0)
		const sc = new Matrix3D().setScaling(2, 2, 2)
		const c = tr.clone().multiply(sc)
		expect(rowClose(toRow(c), rowMul(rowTranslate(5, 0, 0), rowScale(2, 2, 2)))).toBe(true)
		const c2 = sc.clone().multiply(tr)
		expect(rowClose(toRow(c2), rowMul(rowScale(2, 2, 2), rowTranslate(5, 0, 0)))).toBe(true)
	})

	it('multiply translates correctly with rotation (T*R rotates translation)', () => {
		const tr = new Matrix3D().setTranslation(5, 0, 0)
		const rot = new Matrix3D().rotateZMatrix(MathUtils.degToRad(90))
		const c = tr.clone().multiply(rot)
		expect(rowClose(toRow(c), rowMul(rowTranslate(5, 0, 0), rowRotateZ(MathUtils.degToRad(90))))).toBe(true)
	})

	it('preMultiply is row a*this', () => {
		const a = new Matrix3D().setTranslation(1, 0, 0)
		const b = new Matrix3D().setScaling(2, 2, 2)
		const r = a.clone().preMultiply(b) // b * a
		expect(rowClose(toRow(r), rowMul(rowScale(2, 2, 2), rowTranslate(1, 0, 0)))).toBe(true)
	})

	it('Vector multiplyMatrix matches row MultiplyVector', () => {
		const tr = new Matrix3D().setTranslation(10, 20, 30)
		const v = new Vertex3D(1, 2, 3).multiplyMatrix(tr)
		expect(v.x).toBeCloseTo(11, 5)
		expect(v.y).toBeCloseTo(22, 5)
		expect(v.z).toBeCloseTo(33, 5)
		const rot = new Matrix3D().rotateZMatrix(MathUtils.degToRad(90))
		const p = new Vertex3D(1, 0, 0).multiplyMatrix(rot)
		expect(p.x).toBeCloseTo(0, 5)
		expect(p.y).toBeCloseTo(1, 5)
	})

	it('multiplyMatrix divides by wp for perspective matrices', () => {
		const perspective = new Matrix3D().identity()
		perspective._14 = 0.5
		// Row-vector w' = 2*0.5 + 1 = 2, so (2, 0, 0) projects to (1, 0, 0).
		const v = new Vertex3D(2, 0, 0).multiplyMatrix(perspective)
		expect(v.x).toBeCloseTo(1, 5)
		expect(v.y).toBeCloseTo(0, 5)
		expect(v.z).toBeCloseTo(0, 5)
	})

	it('multiplyMatrixNoTranslate ignores translation', () => {
		const tr = new Matrix3D().setTranslation(10, 20, 30)
		const v = new Vertex3D(1, 2, 3).multiplyMatrixNoTranslate(tr)
		expect(v.x).toBeCloseTo(1, 5)
		expect(v.y).toBeCloseTo(2, 5)
		expect(v.z).toBeCloseTo(3, 5)
	})

	it('setFromArray and matrix getter round-trip row-major', () => {
		const src = [
			[1, 2, 3, 4],
			[5, 6, 7, 8],
			[9, 10, 11, 12],
			[13, 14, 15, 16],
		]
		const m = new Matrix3D().setFromArray(src)
		expect(m.matrix).toEqual(src)
		expect(toRow(m)).toEqual(src)
	})

	it('setEach stores row-major directly', () => {
		const m = new Matrix3D().setEach(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16)
		expect(m.elements).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])
		expect(toRow(m)).toEqual([
			[1, 2, 3, 4],
			[5, 6, 7, 8],
			[9, 10, 11, 12],
			[13, 14, 15, 16],
		])
	})

	it('clone and copy preserve row-major', () => {
		const a = new Matrix3D().setTranslation(7, 8, 9)
		const b = a.clone()
		expect(rowClose(toRow(a), toRow(b))).toBe(true)
		const c = new Matrix3D().copy(a) as Matrix3D
		expect(rowClose(toRow(a), toRow(c))).toBe(true)
	})

	it('multiplyMatrices(a,b) equals a*b row', () => {
		const a = new Matrix3D().setTranslation(3, 0, 0)
		const b = new Matrix3D().setScaling(2, 2, 2)
		const r = new Matrix3D().multiplyMatrices(a, b)
		expect(rowClose(toRow(r), rowMul(rowTranslate(3, 0, 0), rowScale(2, 2, 2)))).toBe(true)
		const s = new Matrix3D().multiplyMatrices(b, a)
		expect(rowClose(toRow(s), rowMul(rowScale(2, 2, 2), rowTranslate(3, 0, 0)))).toBe(true)
	})

	it('identity is neutral for multiply', () => {
		const m = new Matrix3D().setTranslation(4, 5, 6).multiply(new Matrix3D().rotateZMatrix(0.7))
		const id = new Matrix3D().identity()
		expect(rowClose(toRow(m.clone().multiply(id)), toRow(m))).toBe(true)
		expect(rowClose(toRow(id.clone().multiply(m)), toRow(m))).toBe(true)
	})

	it('toRightHanded equals M*S and negates col2', () => {
		const m = new Matrix3D().setTranslation(1, 2, 3)
		m.multiply(new Matrix3D().rotateXMatrix(0.3))
		const rh = m.clone().toRightHanded()
		const ref = rowMul(toRow(m), rowScale(1, 1, -1))
		expect(rowClose(toRow(rh), ref)).toBe(true)
		const e = rh.elements
		const o = m.elements
		expect(e[2]).toBeCloseTo(-o[2], 5)
		expect(e[6]).toBeCloseTo(-o[6], 5)
		expect(e[10]).toBeCloseTo(-o[10], 5)
		expect(e[14]).toBeCloseTo(-o[14], 5)
	})

	it('RIGHT_HANDED static is scale(1,1,-1)', () => {
		const rh = Matrix3D.RIGHT_HANDED
		expect(rowClose(toRow(rh), rowScale(1, 1, -1))).toBe(true)
	})
})

describe('Matrix2D row semantics', () => {
	it('skew * orientation left-multiply', () => {
		const skew = new Matrix2D().createSkewSymmetric(new Vertex3D(0, 0, 1))
		const ori = new Matrix2D().set(1, 0, 0, 0, 1, 0, 0, 0, 1)
		const out = new Matrix2D().multiplyMatrices(skew, ori)
		const e = (out as any).elements
		expect(e[0]).toBeCloseTo(0, 5)
		expect(e[1]).toBeCloseTo(1, 5)
	})

	it('applyMatrix2D and multiplyVectorT are transposes', () => {
		const m = new Matrix2D().set(2, 3, 5, 7, 11, 13, 17, 19, 23)
		const v = new Vertex3D(1, 2, 3)
		const a = v.clone(true).applyMatrix2D(m)
		const e = (m as any).elements
		expect(a.x).toBeCloseTo(e[0] * 1 + e[3] * 2 + e[6] * 3, 5)
		expect(a.y).toBeCloseTo(e[1] * 1 + e[4] * 2 + e[7] * 3, 5)
		const t = m.multiplyVectorT(v)
		expect(t.x).toBeCloseTo(e[0] * 1 + e[1] * 2 + e[2] * 3, 5)
		expect(t.y).toBeCloseTo(e[3] * 1 + e[4] * 2 + e[5] * 3, 5)
	})

	it('matrix setter/getter round-trips row-major', () => {
		const src = [
			[1, 2, 3],
			[4, 5, 6],
			[7, 8, 9],
		]
		const mat = new Matrix2D()
		mat.matrix = src
		expect(mat.matrix).toEqual(src)
	})
})

describe('Matrix3D disabled column-major helpers', () => {
	it('throws on every column-major builder instead of silently transposing', () => {
		const disabled = [
			'makeTranslation',
			'makeRotationX',
			'makeRotationY',
			'makeRotationZ',
			'makeRotationFromEuler',
			'makeRotationFromQuaternion',
			'makeScale',
			'makeShear',
			'makePerspective',
			'makeOrthographic',
			'makeBasis',
			'extractBasis',
			'extractRotation',
			'compose',
			'decompose',
			'lookAt',
			'setPosition',
			'copyPosition',
			'scale',
		] as const
		const mat = new Matrix3D()
		for (const name of disabled) {
			expect(() => (mat as any)[name]()).toThrow(/row-major/)
		}
	})

	it('keeps the transpose-invert-transpose sandwich working', () => {
		const full = new Matrix3D().setScaling(2, 3, 4).multiply(new Matrix3D().setTranslation(5, 6, 7))
		const inv = full.clone().transpose().invert().transpose()
		const identity = inv.clone().multiply(full)
		expect(identity.elements[0]).toBeCloseTo(1, 5)
		expect(identity.elements[5]).toBeCloseTo(1, 5)
		expect(identity.elements[10]).toBeCloseTo(1, 5)
		expect(identity.elements[15]).toBeCloseTo(1, 5)
		expect(identity.elements[12]).toBeCloseTo(0, 5)
		expect(identity.elements[13]).toBeCloseTo(0, 5)
		expect(identity.elements[14]).toBeCloseTo(0, 5)
	})
})
