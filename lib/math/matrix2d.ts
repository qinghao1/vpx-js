// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Matrix3, Vector3 } from 'three'
import { Pool } from '../util/object-pool.js'
import { Vertex3D } from './vertex3d.js'

/** 3×3 matrix (VP column-major, three.js based). @see https://github.com/vpinball/vpinball/blob/master/math/matrix.cpp */
export class Matrix2D extends Matrix3 {
	private static readonly POOL = new Pool(Matrix2D)

	static claim(): Matrix2D {
		return Matrix2D.POOL.get()
	}

	static release(...ms: Matrix2D[]): void {
		for (const m of ms) Matrix2D.POOL.release(m)
	}

	static reset(m: Matrix2D): void {
		m.identity()
	}

	/** Column-major 3×3 storage (`matrix[col][row]`). */
	get matrix(): number[][] {
		const e = this.elements
		return [
			[e[0], e[1], e[2]],
			[e[3], e[4], e[5]],
			[e[6], e[7], e[8]],
		]
	}

	set matrix(m: number[][]) {
		this.set(m[0][0], m[1][0], m[2][0], m[0][1], m[1][1], m[2][1], m[0][2], m[1][2], m[2][2])
	}

	override identity(): this {
		super.identity()
		return this
	}

	/** VP compat. */
	setIdentity(): this {
		return this.identity()
	}

	/** Multiplies vector by transposed matrix. */
	multiplyVectorT(v: Vertex3D, recycle = false): Vertex3D {
		const e = this.elements
		const x = e[0] * v.x + e[3] * v.y + e[6] * v.z
		const y = e[1] * v.x + e[4] * v.y + e[7] * v.z
		const z = e[2] * v.x + e[5] * v.y + e[8] * v.z
		return recycle ? Vertex3D.claim(x, y, z) : new Vertex3D(x, y, z)
	}

	/** Sets rotation around axis (s=sin, c=cos). */
	rotationAroundAxis(axis: Vertex3D, s: number, c: number): void {
		const { x, y, z } = axis
		const oc = 1 - c
		this.set(
			x * x + c * (1 - x * x),
			x * y * oc - z * s,
			z * x * oc + y * s,
			x * y * oc + z * s,
			y * y + c * (1 - y * y),
			y * z * oc - x * s,
			z * x * oc - y * s,
			y * z * oc + x * s,
			z * z + c * (1 - z * z),
		)
	}

	/** Sets skew-symmetric matrix of v. */
	createSkewSymmetric(v: Vertex3D): this {
		this.set(0, v.z, -v.y, -v.z, 0, v.x, v.y, -v.x, 0)
		return this
	}

	override clone(): this {
		return super.clone() as unknown as this
	}

	clonePooled(recycle = false): Matrix2D {
		if (recycle) {
			const m = Matrix2D.claim()
			m.copy(this)
			return m
		}
		return this.clone() as unknown as Matrix2D
	}

	/** Copies from other. */
	copyMatrix(m: Matrix2D): void {
		this.copy(m)
	}

	/** Legacy alias. */
	setFromMatrix(m: Matrix2D): void {
		this.copy(m)
	}

	setFrom(m: Matrix2D): this {
		this.copy(m)
		return this
	}

	override set(
		n11: number,
		n12: number,
		n13: number,
		n21: number,
		n22: number,
		n23: number,
		n31: number,
		n32: number,
		n33: number,
	): this
	override set(m: Matrix2D): this
	override set(...args: any[]): this {
		if (args.length === 1 && args[0] instanceof Matrix3) {
			this.copy(args[0])
			return this
		}
		return super.set(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8]) as unknown as this
	}

	/** Sets to a·b. */
	multiplyMatrix(a: Matrix2D, b: Matrix2D): void {
		this.multiplyMatrices(a, b)
	}

	override multiplyScalar(s: number): this {
		super.multiplyScalar(s)
		return this
	}

	/** Sets to a+b. */
	addMatrix(a: Matrix2D, b: Matrix2D): void {
		const ae = a.elements,
			be = b.elements,
			e = this.elements
		for (let i = 0; i < 9; i++) e[i] = ae[i] + be[i]
	}

	/** Orthonormalizes. */
	orthoNormalize(): void {
		const e = this.elements
		const vx = new Vector3(e[0], e[1], e[2])
		const vy = new Vector3(e[3], e[4], e[5])
		const vz = new Vector3().crossVectors(vx, vy)
		vx.normalize()
		vz.normalize()
		const vyy = new Vector3().crossVectors(vz, vx)
		e[0] = vx.x
		e[1] = vx.y
		e[2] = vx.z
		e[3] = vyy.x
		e[4] = vyy.y
		e[5] = vyy.z
		e[6] = vz.x
		e[7] = vz.y
		e[8] = vz.z
	}

	override equals(m: Matrix3): boolean {
		return super.equals(m)
	}

	toThree(): Matrix3 {
		return this.clone() as unknown as Matrix3
	}

	static fromThree(m: Matrix3): Matrix2D {
		const out = new Matrix2D()
		out.copy(m)
		return out
	}

	override toString(): string {
		const r = (n: number) => Math.round(n * 1000) / 1000
		const e = this.elements
		return `[${r(e[0])}, ${r(e[3])}, ${r(e[6])}]\n[${r(e[1])}, ${r(e[4])}, ${r(e[7])}]\n[${r(e[2])}, ${r(e[5])}, ${r(e[8])}]`
	}
}
