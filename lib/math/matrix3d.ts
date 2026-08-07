// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Matrix4 } from 'three'
import { Pool } from '../util/object-pool.js'
import { f4 } from './float.js'

/** 4×4 matrix (VP-compatible, three.js interoperable). */
export class Matrix3D {
	private static readonly POOL = new Pool(Matrix3D)

	/** Row-major 4×4 storage. */
	private readonly matrix: number[][] = [
		[1, 0, 0, 0],
		[0, 1, 0, 0],
		[0, 0, 1, 0],
		[0, 0, 0, 1],
	]

	constructor() {
		this.setIdentity()
	}

	/** Claims a pooled instance. */
	static claim(): Matrix3D {
		return Matrix3D.POOL.get()
	}

	/** Releases instances. */
	static release(...ms: Matrix3D[]): void {
		for (const m of ms) Matrix3D.POOL.release(m)
	}

	/** Resets pooled instance. */
	static reset(m: Matrix3D): void {
		m.setIdentity()
	}

	/** Copies from 2D array. */
	set(m: number[][]): this {
		for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) this.matrix[i][j] = m[i][j]
		return this
	}

	/** Sets from 16 values (row-major). */
	setEach(...m: number[]): this {
		for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) this.matrix[i][j] = m[i * 4 + j]
		return this
	}

	/** Sets to identity. */
	setIdentity(): this {
		this._11 = this._22 = this._33 = this._44 = 1
		this._12 =
			this._13 =
			this._14 =
			this._21 =
			this._23 =
			this._24 =
			this._31 =
			this._32 =
			this._34 =
			this._41 =
			this._42 =
			this._43 =
				0
		return this
	}

	/** Sets translation. */
	setTranslation(tx: number, ty: number, tz: number): this {
		this.setIdentity()
		this._41 = tx
		this._42 = ty
		this._43 = tz
		return this
	}

	/** Sets scaling. */
	setScaling(sx: number, sy: number, sz: number): this {
		this.setIdentity()
		this._11 = sx
		this._22 = sy
		this._33 = sz
		return this
	}

	/** Sets X rotation. */
	rotateXMatrix(rad: number): this {
		this.setIdentity()
		const c = Math.cos(f4(rad)),
			s = Math.sin(f4(rad))
		this._22 = this._33 = c
		this._23 = s
		this._32 = -s
		return this
	}

	/** Sets Y rotation. */
	rotateYMatrix(rad: number): this {
		this.setIdentity()
		const c = Math.cos(f4(rad)),
			s = Math.sin(f4(rad))
		this._11 = this._33 = c
		this._31 = s
		this._13 = -s
		return this
	}

	/** Sets Z rotation. */
	rotateZMatrix(rad: number): this {
		this.setIdentity()
		const c = Math.cos(f4(rad)),
			s = Math.sin(f4(rad))
		this._11 = this._22 = c
		this._12 = s
		this._21 = -s
		return this
	}

	/** Multiplies by matrix (VP order). */
	multiply(a: Matrix3D, b?: Matrix3D): this {
		const prod = b ? Matrix3D.mul(a, b, true) : Matrix3D.mul(this, a, true)
		this.set(prod.matrix)
		Matrix3D.release(prod)
		return this
	}

	/** Pre-multiplies by matrix. */
	preMultiply(a: Matrix3D): this {
		const prod = Matrix3D.mul(a, this, true)
		this.set(prod.matrix)
		Matrix3D.release(prod)
		return this
	}

	/** Flips Z for right-handed conversion. */
	toRightHanded(): this {
		const m = Matrix3D.claim().setScaling(1, 1, -1)
		this.multiply(m)
		Matrix3D.release(m)
		return this
	}

	private static toThree(a: Matrix3D): Matrix4 {
		return new Matrix4().set(
			a.matrix[0][0],
			a.matrix[1][0],
			a.matrix[2][0],
			a.matrix[3][0],
			a.matrix[0][1],
			a.matrix[1][1],
			a.matrix[2][1],
			a.matrix[3][1],
			a.matrix[0][2],
			a.matrix[1][2],
			a.matrix[2][2],
			a.matrix[3][2],
			a.matrix[0][3],
			a.matrix[1][3],
			a.matrix[2][3],
			a.matrix[3][3],
		)
	}

	private static fromThree(out: Matrix3D, m: Matrix4): Matrix3D {
		const e = m.elements
		out.matrix[0][0] = f4(e[0])
		out.matrix[0][1] = f4(e[1])
		out.matrix[0][2] = f4(e[2])
		out.matrix[0][3] = f4(e[3])
		out.matrix[1][0] = f4(e[4])
		out.matrix[1][1] = f4(e[5])
		out.matrix[1][2] = f4(e[6])
		out.matrix[1][3] = f4(e[7])
		out.matrix[2][0] = f4(e[8])
		out.matrix[2][1] = f4(e[9])
		out.matrix[2][2] = f4(e[10])
		out.matrix[2][3] = f4(e[11])
		out.matrix[3][0] = f4(e[12])
		out.matrix[3][1] = f4(e[13])
		out.matrix[3][2] = f4(e[14])
		out.matrix[3][3] = f4(e[15])
		return out
	}

	private static mul(a: Matrix3D, b: Matrix3D, recycle = false): Matrix3D {
		const out = new Matrix4().multiplyMatrices(Matrix3D.toThree(a), Matrix3D.toThree(b))
		const r = recycle ? Matrix3D.claim() : new Matrix3D()
		return Matrix3D.fromThree(r, out)
	}

	/** Clones, optionally pooled. */
	clone(recycle = false): Matrix3D {
		return recycle ? Matrix3D.claim().set(this.matrix) : new Matrix3D().set(this.matrix)
	}

	/** Exact equality. */
	equals(m: Matrix3D): boolean {
		for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (this.matrix[i][j] !== m.matrix[i][j]) return false
		return true
	}

	/** Converts to THREE.Matrix4. */
	toThree(): Matrix4 {
		return Matrix3D.toThree(this)
	}

	/** Creates from THREE.Matrix4. */
	static fromThreeMatrix(m: Matrix4): Matrix3D {
		const out = new Matrix3D()
		return Matrix3D.fromThree(out, m)
	}

	debug(): string[] {
		return [
			`_11: ${this._11}`,
			`_12: ${this._12}`,
			`_13: ${this._13}`,
			`_14: ${this._14}`,
			`_21: ${this._21}`,
			`_22: ${this._22}`,
			`_23: ${this._23}`,
			`_24: ${this._24}`,
			`_31: ${this._31}`,
			`_32: ${this._32}`,
			`_33: ${this._33}`,
			`_34: ${this._34}`,
			`_41: ${this._41}`,
			`_42: ${this._42}`,
			`_43: ${this._43}`,
			`_44: ${this._44}`,
		]
	}

	get _11(): number {
		return this.matrix[0][0]
	}
	set _11(v: number) {
		this.matrix[0][0] = f4(v)
	}
	get _12(): number {
		return this.matrix[1][0]
	}
	set _12(v: number) {
		this.matrix[1][0] = f4(v)
	}
	get _13(): number {
		return this.matrix[2][0]
	}
	set _13(v: number) {
		this.matrix[2][0] = f4(v)
	}
	get _14(): number {
		return this.matrix[3][0]
	}
	set _14(v: number) {
		this.matrix[3][0] = f4(v)
	}
	get _21(): number {
		return this.matrix[0][1]
	}
	set _21(v: number) {
		this.matrix[0][1] = f4(v)
	}
	get _22(): number {
		return this.matrix[1][1]
	}
	set _22(v: number) {
		this.matrix[1][1] = f4(v)
	}
	get _23(): number {
		return this.matrix[2][1]
	}
	set _23(v: number) {
		this.matrix[2][1] = f4(v)
	}
	get _24(): number {
		return this.matrix[3][1]
	}
	set _24(v: number) {
		this.matrix[3][1] = f4(v)
	}
	get _31(): number {
		return this.matrix[0][2]
	}
	set _31(v: number) {
		this.matrix[0][2] = f4(v)
	}
	get _32(): number {
		return this.matrix[1][2]
	}
	set _32(v: number) {
		this.matrix[1][2] = f4(v)
	}
	get _33(): number {
		return this.matrix[2][2]
	}
	set _33(v: number) {
		this.matrix[2][2] = f4(v)
	}
	get _34(): number {
		return this.matrix[3][2]
	}
	set _34(v: number) {
		this.matrix[3][2] = f4(v)
	}
	get _41(): number {
		return this.matrix[0][3]
	}
	set _41(v: number) {
		this.matrix[0][3] = f4(v)
	}
	get _42(): number {
		return this.matrix[1][3]
	}
	set _42(v: number) {
		this.matrix[1][3] = f4(v)
	}
	get _43(): number {
		return this.matrix[2][3]
	}
	set _43(v: number) {
		this.matrix[2][3] = f4(v)
	}
	get _44(): number {
		return this.matrix[3][3]
	}
	set _44(v: number) {
		this.matrix[3][3] = f4(v)
	}

	static readonly RIGHT_HANDED = new Matrix3D().setEach(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1)
}
