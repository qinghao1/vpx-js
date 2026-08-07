// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Pool } from '../util/object-pool.js'
import { f4, fr } from './float.js'

/** VPinball-compatible 4×4 matrix (differs from Three's multiply). */
export class Matrix3D {
	private static readonly POOL = new Pool(Matrix3D)
	private readonly matrix = [
		[1, 0, 0, 0],
		[0, 1, 0, 0],
		[0, 0, 1, 0],
		[0, 0, 0, 1],
	]

	constructor() {
		this.setIdentity()
	}

	public static claim(): Matrix3D {
		return Matrix3D.POOL.get()
	}
	public static release(...m: Matrix3D[]): void {
		for (const x of m) Matrix3D.POOL.release(x)
	}
	public static reset(m: Matrix3D): void {
		m.setIdentity()
	}

	public set(m: number[][]): this {
		for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) this.matrix[i][j] = m[i][j]
		return this
	}

	public setEach(...m: number[]): this {
		for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) this.matrix[i][j] = m[i * 4 + j]
		return this
	}

	public setIdentity(): this {
		this._11 = this._22 = this._33 = this._44 = 1
		this._12 =
			this._13 =
			this._14 =
			this._41 =
			this._21 =
			this._23 =
			this._24 =
			this._42 =
			this._31 =
			this._32 =
			this._34 =
			this._43 =
				0
		return this
	}

	public setTranslation(tx: number, ty: number, tz: number): this {
		this.setIdentity()
		this._41 = tx
		this._42 = ty
		this._43 = tz
		return this
	}

	public setScaling(sx: number, sy: number, sz: number): this {
		this.setIdentity()
		this._11 = sx
		this._22 = sy
		this._33 = sz
		return this
	}

	public rotateXMatrix(x: number): this {
		this.setIdentity()
		this._22 = this._33 = Math.cos(f4(x))
		this._23 = Math.sin(f4(x))
		this._32 = -this._23
		return this
	}

	public rotateYMatrix(y: number): this {
		this.setIdentity()
		this._11 = this._33 = Math.cos(f4(y))
		this._31 = Math.sin(f4(y))
		this._13 = -this._31
		return this
	}

	public rotateZMatrix(z: number): this {
		this.setIdentity()
		this._11 = this._22 = Math.cos(f4(z))
		this._12 = Math.sin(f4(z))
		this._21 = -this._12
		return this
	}

	public multiply(a: Matrix3D, b?: Matrix3D): this {
		const prod = b ? Matrix3D.mul(a, b, true) : Matrix3D.mul(this, a, true)
		this.set(prod.matrix)
		Matrix3D.release(prod)
		return this
	}

	public preMultiply(a: Matrix3D): this {
		const prod = Matrix3D.mul(a, this, true)
		this.set(prod.matrix)
		Matrix3D.release(prod)
		return this
	}

	public toRightHanded(): this {
		const m = Matrix3D.claim().setScaling(1, 1, -1)
		this.multiply(m)
		Matrix3D.release(m)
		return this
	}

	private static mul(a: Matrix3D, b: Matrix3D, recycle = false): Matrix3D {
		const r = recycle ? Matrix3D.claim() : new Matrix3D()
		for (let i = 0; i < 4; i++)
			for (let l = 0; l < 4; l++) {
				r.matrix[i][l] = f4(
					f4(
						f4(f4(a.matrix[0][l] * b.matrix[i][0]) + f4(a.matrix[1][l] * b.matrix[i][1])) +
							f4(a.matrix[2][l] * b.matrix[i][2]),
					) + f4(a.matrix[3][l] * b.matrix[i][3]),
				)
			}
		return r
	}

	public clone(recycle = false): Matrix3D {
		return recycle ? Matrix3D.claim().set(this.matrix) : new Matrix3D().set(this.matrix)
	}

	public equals(m: Matrix3D): boolean {
		for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (this.matrix[i][j] !== m.matrix[i][j]) return false
		return true
	}

	public debug(): string[] {
		return [
			`_11: $fr(this._11)`,
			`_12: $fr(this._12)`,
			`_13: $fr(this._13)`,
			`_14: $fr(this._14)`,
			`_21: $fr(this._21)`,
			`_22: $fr(this._22)`,
			`_23: $fr(this._23)`,
			`_24: $fr(this._24)`,
			`_31: $fr(this._31)`,
			`_32: $fr(this._32)`,
			`_33: $fr(this._33)`,
			`_34: $fr(this._34)`,
			`_41: $fr(this._41)`,
			`_42: $fr(this._42)`,
			`_43: $fr(this._43)`,
			`_44: $fr(this._44)`,
		]
	}

	/** Get _11. */
	get _11() {
		return this.matrix[0][0]
	}
	set _11(v) {
		this.matrix[0][0] = f4(v)
	}
	/** Get _12. */
	get _12() {
		return this.matrix[1][0]
	}
	set _12(v) {
		this.matrix[1][0] = f4(v)
	}
	/** Get _13. */
	get _13() {
		return this.matrix[2][0]
	}
	set _13(v) {
		this.matrix[2][0] = f4(v)
	}
	/** Get _14. */
	get _14() {
		return this.matrix[3][0]
	}
	set _14(v) {
		this.matrix[3][0] = f4(v)
	}
	/** Get _21. */
	get _21() {
		return this.matrix[0][1]
	}
	set _21(v) {
		this.matrix[0][1] = f4(v)
	}
	/** Get _22. */
	get _22() {
		return this.matrix[1][1]
	}
	set _22(v) {
		this.matrix[1][1] = f4(v)
	}
	/** Get _23. */
	get _23() {
		return this.matrix[2][1]
	}
	set _23(v) {
		this.matrix[2][1] = f4(v)
	}
	/** Get _24. */
	get _24() {
		return this.matrix[3][1]
	}
	set _24(v) {
		this.matrix[3][1] = f4(v)
	}
	/** Get _31. */
	get _31() {
		return this.matrix[0][2]
	}
	set _31(v) {
		this.matrix[0][2] = f4(v)
	}
	/** Get _32. */
	get _32() {
		return this.matrix[1][2]
	}
	set _32(v) {
		this.matrix[1][2] = f4(v)
	}
	/** Get _33. */
	get _33() {
		return this.matrix[2][2]
	}
	set _33(v) {
		this.matrix[2][2] = f4(v)
	}
	/** Get _34. */
	get _34() {
		return this.matrix[3][2]
	}
	set _34(v) {
		this.matrix[3][2] = f4(v)
	}
	/** Get _41. */
	get _41() {
		return this.matrix[0][3]
	}
	set _41(v) {
		this.matrix[0][3] = f4(v)
	}
	/** Get _42. */
	get _42() {
		return this.matrix[1][3]
	}
	set _42(v) {
		this.matrix[1][3] = f4(v)
	}
	/** Get _43. */
	get _43() {
		return this.matrix[2][3]
	}
	set _43(v) {
		this.matrix[2][3] = f4(v)
	}
	/** Get _44. */
	get _44() {
		return this.matrix[3][3]
	}
	set _44(v) {
		this.matrix[3][3] = f4(v)
	}

	public static readonly RIGHT_HANDED = new Matrix3D().setEach(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1)
}
