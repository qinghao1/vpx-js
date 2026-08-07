// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Matrix4 } from 'three'
import { Pool } from '../util/object-pool.js'
import { f4 } from './float.js'

/** 4×4 matrix (VP column-major, three.js based). @see https://github.com/vpinball/vpinball/blob/master/math/matrix.cpp */
export class Matrix3D extends Matrix4 {
	private static readonly POOL = new Pool(Matrix3D)

	static claim(): Matrix3D {
		return Matrix3D.POOL.get()
	}

	static release(...ms: Matrix3D[]): void {
		for (const m of ms) Matrix3D.POOL.release(m)
	}

	static reset(m: Matrix3D): void {
		m.identity()
	}

	override identity(): this {
		super.identity()
		return this
	}

	/** VP compat. */
	setIdentity(): this {
		return this.identity()
	}

	/** Copies from column-major 2D array. */
	setFromArray(m: number[][]): this {
		this.set(
			m[0][0],
			m[1][0],
			m[2][0],
			m[3][0],
			m[0][1],
			m[1][1],
			m[2][1],
			m[3][1],
			m[0][2],
			m[1][2],
			m[2][2],
			m[3][2],
			m[0][3],
			m[1][3],
			m[2][3],
			m[3][3],
		)
		return this
	}

	override set(
		n11: number,
		n12: number,
		n13: number,
		n14: number,
		n21: number,
		n22: number,
		n23: number,
		n24: number,
		n31: number,
		n32: number,
		n33: number,
		n34: number,
		n41: number,
		n42: number,
		n43: number,
		n44: number,
	): this
	override set(m: number[][]): this
	override set(...args: any[]): this {
		if (args.length === 1 && Array.isArray(args[0])) {
			return this.setFromArray(args[0])
		}
		return super.set(
			args[0],
			args[1],
			args[2],
			args[3],
			args[4],
			args[5],
			args[6],
			args[7],
			args[8],
			args[9],
			args[10],
			args[11],
			args[12],
			args[13],
			args[14],
			args[15],
		) as unknown as this
	}

	/** Sets from 16 values (row-major). */
	setEach(...m: number[]): this {
		this.set(m[0], m[4], m[8], m[12], m[1], m[5], m[9], m[13], m[2], m[6], m[10], m[14], m[3], m[7], m[11], m[15])
		return this
	}

	setTranslation(tx: number, ty: number, tz: number): this {
		this.identity()
		this.elements[12] = f4(tx)
		this.elements[13] = f4(ty)
		this.elements[14] = f4(tz)
		return this
	}

	setScaling(sx: number, sy: number, sz: number): this {
		this.identity()
		this.elements[0] = f4(sx)
		this.elements[5] = f4(sy)
		this.elements[10] = f4(sz)
		return this
	}

	rotateXMatrix(rad: number): this {
		this.makeRotationX(f4(rad))
		for (let i = 0; i < 16; i++) this.elements[i] = f4(this.elements[i])
		return this
	}

	rotateYMatrix(rad: number): this {
		this.makeRotationY(f4(rad))
		for (let i = 0; i < 16; i++) this.elements[i] = f4(this.elements[i])
		return this
	}

	rotateZMatrix(rad: number): this {
		this.makeRotationZ(f4(rad))
		for (let i = 0; i < 16; i++) this.elements[i] = f4(this.elements[i])
		return this
	}

	override multiply(m: Matrix4): this
	override multiply(a: Matrix4, b: Matrix4): this
	override multiply(a: any, b?: any): this {
		if (b !== undefined) {
			super.multiplyMatrices(a, b)
			for (let i = 0; i < 16; i++) this.elements[i] = f4(this.elements[i])
			return this
		}
		const clone = this.clone() as unknown as Matrix4
		super.multiplyMatrices(clone, a)
		for (let i = 0; i < 16; i++) this.elements[i] = f4(this.elements[i])
		return this
	}

	multiplyVP(a: Matrix3D, b?: Matrix3D): this {
		if (b) {
			super.multiplyMatrices(a, b)
			for (let i = 0; i < 16; i++) this.elements[i] = f4(this.elements[i])
			return this
		}
		return this.multiply(a)
	}

	preMultiply(a: Matrix3D): this {
		const cur = this.clone() as unknown as Matrix4
		super.multiplyMatrices(a, cur)
		for (let i = 0; i < 16; i++) this.elements[i] = f4(this.elements[i])
		return this
	}

	toRightHanded(): this {
		const m = Matrix3D.claim().setScaling(1, 1, -1)
		this.multiply(m)
		Matrix3D.release(m)
		return this
	}

	override clone(): this {
		return super.clone() as unknown as this
	}

	clonePooled(recycle = false): Matrix3D {
		if (recycle) {
			const m = Matrix3D.claim()
			m.copy(this)
			return m
		}
		return this.clone() as unknown as Matrix3D
	}

	override equals(m: Matrix4): boolean {
		return super.equals(m)
	}

	toThree(): Matrix4 {
		return this.clone() as unknown as Matrix4
	}

	static fromThreeMatrix(m: Matrix4): Matrix3D {
		const out = new Matrix3D()
		out.copy(m)
		for (let i = 0; i < 16; i++) out.elements[i] = f4(out.elements[i])
		return out
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
		return this.elements[0]
	}
	set _11(v: number) {
		this.elements[0] = f4(v)
	}
	get _12(): number {
		return this.elements[4]
	}
	set _12(v: number) {
		this.elements[4] = f4(v)
	}
	get _13(): number {
		return this.elements[8]
	}
	set _13(v: number) {
		this.elements[8] = f4(v)
	}
	get _14(): number {
		return this.elements[12]
	}
	set _14(v: number) {
		this.elements[12] = f4(v)
	}
	get _21(): number {
		return this.elements[1]
	}
	set _21(v: number) {
		this.elements[1] = f4(v)
	}
	get _22(): number {
		return this.elements[5]
	}
	set _22(v: number) {
		this.elements[5] = f4(v)
	}
	get _23(): number {
		return this.elements[9]
	}
	set _23(v: number) {
		this.elements[9] = f4(v)
	}
	get _24(): number {
		return this.elements[13]
	}
	set _24(v: number) {
		this.elements[13] = f4(v)
	}
	get _31(): number {
		return this.elements[2]
	}
	set _31(v: number) {
		this.elements[2] = f4(v)
	}
	get _32(): number {
		return this.elements[6]
	}
	set _32(v: number) {
		this.elements[6] = f4(v)
	}
	get _33(): number {
		return this.elements[10]
	}
	set _33(v: number) {
		this.elements[10] = f4(v)
	}
	get _34(): number {
		return this.elements[14]
	}
	set _34(v: number) {
		this.elements[14] = f4(v)
	}
	get _41(): number {
		return this.elements[3]
	}
	set _41(v: number) {
		this.elements[3] = f4(v)
	}
	get _42(): number {
		return this.elements[7]
	}
	set _42(v: number) {
		this.elements[7] = f4(v)
	}
	get _43(): number {
		return this.elements[11]
	}
	set _43(v: number) {
		this.elements[11] = f4(v)
	}
	get _44(): number {
		return this.elements[15]
	}
	set _44(v: number) {
		this.elements[15] = f4(v)
	}

	/** Column-major 4×4 (`matrix[col][row]`). */
	get matrix(): number[][] {
		const e = this.elements
		return [
			[e[0], e[1], e[2], e[3]],
			[e[4], e[5], e[6], e[7]],
			[e[8], e[9], e[10], e[11]],
			[e[12], e[13], e[14], e[15]],
		]
	}

	set matrix(m: number[][]) {
		this.set(
			m[0][0],
			m[1][0],
			m[2][0],
			m[3][0],
			m[0][1],
			m[1][1],
			m[2][1],
			m[3][1],
			m[0][2],
			m[1][2],
			m[2][2],
			m[3][2],
			m[0][3],
			m[1][3],
			m[2][3],
			m[3][3],
		)
	}

	static readonly RIGHT_HANDED = new Matrix3D().setEach(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1)
}
