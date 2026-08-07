// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Pool } from '../util/object-pool.js'
import { Vertex3D } from './vertex3d.js'

/** 3×3 rotation matrix (VPinball-compatible). */
export class Matrix2D {
	private static readonly POOL = new Pool(Matrix2D)

	public readonly matrix = [
		[1, 0, 0],
		[0, 1, 0],
		[0, 0, 1],
	]

	public static claim(): Matrix2D {
		return Matrix2D.POOL.get()
	}
	public static release(...matrices: Matrix2D[]): void {
		for (const m of matrices) Matrix2D.POOL.release(m)
	}
	public static reset(m: Matrix2D): void {
		m.setIdentity()
	}

	public setIdentity(): this {
		this.matrix[0][0] = 1
		this.matrix[0][1] = 0
		this.matrix[0][2] = 0
		this.matrix[1][0] = 0
		this.matrix[1][1] = 1
		this.matrix[1][2] = 0
		this.matrix[2][0] = 0
		this.matrix[2][1] = 0
		this.matrix[2][2] = 1
		return this
	}

	public multiplyVectorT(v: Vertex3D, recycle = false): Vertex3D {
		const x = this.matrix[0][0] * v.x + this.matrix[1][0] * v.y + this.matrix[2][0] * v.z
		const y = this.matrix[0][1] * v.x + this.matrix[1][1] * v.y + this.matrix[2][1] * v.z
		const z = this.matrix[0][2] * v.x + this.matrix[1][2] * v.y + this.matrix[2][2] * v.z
		return recycle ? Vertex3D.claim(x, y, z) : new Vertex3D(x, y, z)
	}

	public rotationAroundAxis(axis: Vertex3D, rsin: number, rcos: number): void {
		this.matrix[0][0] = axis.x * axis.x + rcos * (1 - axis.x * axis.x)
		this.matrix[1][0] = axis.x * axis.y * (1 - rcos) - axis.z * rsin
		this.matrix[2][0] = axis.z * axis.x * (1 - rcos) + axis.y * rsin
		this.matrix[0][1] = axis.x * axis.y * (1 - rcos) + axis.z * rsin
		this.matrix[1][1] = axis.y * axis.y + rcos * (1 - axis.y * axis.y)
		this.matrix[2][1] = axis.y * axis.z * (1 - rcos) - axis.x * rsin
		this.matrix[0][2] = axis.z * axis.x * (1 - rcos) - axis.y * rsin
		this.matrix[1][2] = axis.y * axis.z * (1 - rcos) + axis.x * rsin
		this.matrix[2][2] = axis.z * axis.z + rcos * (1 - axis.z * axis.z)
	}

	public createSkewSymmetric(v: Vertex3D): this {
		this.matrix[0][0] = 0
		this.matrix[0][1] = -v.z
		this.matrix[0][2] = v.y
		this.matrix[1][0] = v.z
		this.matrix[1][1] = 0
		this.matrix[1][2] = -v.x
		this.matrix[2][0] = -v.y
		this.matrix[2][1] = v.x
		this.matrix[2][2] = 0
		return this
	}

	public clone(recycle = false): Matrix2D {
		const m = recycle ? Matrix2D.claim() : new Matrix2D()
		for (let i = 0; i < 3; i++) for (let l = 0; l < 3; l++) m.matrix[i][l] = this.matrix[i][l]
		return m
	}

	public set(m: Matrix2D): void {
		for (let i = 0; i < 3; i++) for (let l = 0; l < 3; l++) this.matrix[i][l] = m.matrix[i][l]
	}

	public multiplyMatrix(a: Matrix2D, b: Matrix2D): void {
		for (let i = 0; i < 3; i++)
			for (let l = 0; l < 3; l++) {
				this.matrix[i][l] =
					a.matrix[i][0] * b.matrix[0][l] + a.matrix[i][1] * b.matrix[1][l] + a.matrix[i][2] * b.matrix[2][l]
			}
	}

	public multiplyScalar(s: number): void {
		for (let i = 0; i < 3; i++) for (let l = 0; l < 3; l++) this.matrix[i][l] *= s
	}

	public addMatrix(a: Matrix2D, b: Matrix2D): void {
		for (let i = 0; i < 3; i++) for (let l = 0; l < 3; l++) this.matrix[i][l] = a.matrix[i][l] + b.matrix[i][l]
	}

	public orthoNormalize(): void {
		const vX = Vertex3D.claim(this.matrix[0][0], this.matrix[1][0], this.matrix[2][0])
		const vY = Vertex3D.claim(this.matrix[0][1], this.matrix[1][1], this.matrix[2][1])
		const vZ = Vertex3D.crossProduct(vX, vY, true)
		vX.normalize()
		vZ.normalize()
		const vYY = Vertex3D.crossProduct(vZ, vX, true)
		this.matrix[0][0] = vX.x
		this.matrix[0][1] = vYY.x
		this.matrix[0][2] = vZ.x
		this.matrix[1][0] = vX.y
		this.matrix[1][1] = vYY.y
		this.matrix[1][2] = vZ.y
		this.matrix[2][0] = vX.z
		this.matrix[2][1] = vYY.z
		this.matrix[2][2] = vZ.z
		Vertex3D.release(vX, vY, vZ, vYY)
	}

	public equals(m: Matrix2D): boolean {
		return (
			this.matrix[0][0] === m.matrix[0][0] &&
			this.matrix[0][1] === m.matrix[0][1] &&
			this.matrix[0][2] === m.matrix[0][2] &&
			this.matrix[1][0] === m.matrix[1][0] &&
			this.matrix[1][1] === m.matrix[1][1] &&
			this.matrix[1][2] === m.matrix[1][2] &&
			this.matrix[2][0] === m.matrix[2][0] &&
			this.matrix[2][1] === m.matrix[2][1] &&
			this.matrix[2][2] === m.matrix[2][2]
		)
	}

	public toString(): string {
		const r = (n: number) => Math.round(n * 1000) / 1000
		return (
			`[${r(this.matrix[0][0])}, ${r(this.matrix[0][1])}, ${r(this.matrix[0][2])}]\n` +
			`[${r(this.matrix[1][0])}, ${r(this.matrix[1][1])}, ${r(this.matrix[1][2])}]\n` +
			`[${r(this.matrix[2][0])}, ${r(this.matrix[2][1])}, ${r(this.matrix[2][2])}]\n`
		)
	}
}
