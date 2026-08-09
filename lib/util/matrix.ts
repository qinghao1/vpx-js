// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Matrix3, Matrix4, Vector3 } from 'three'
import { pooled } from './object-pool.js'
import { Vertex3D } from './vector.js'

export class Matrix2D extends Matrix3 {
	private static readonly _pooled = pooled(Matrix2D)
	static claim(): Matrix2D {
		return Matrix2D._pooled.claim()
	}
	static release(...ms: Matrix2D[]): void {
		Matrix2D._pooled.release(...ms)
	}
	static reset(m: Matrix2D): void {
		m.identity()
	}
	get matrix(): number[][] {
		const e = this.elements
		return [
			[e[0], e[3], e[6]],
			[e[1], e[4], e[7]],
			[e[2], e[5], e[8]],
		]
	}
	set matrix(m: number[][]) {
		this.set(m[0][0], m[1][0], m[2][0], m[0][1], m[1][1], m[2][1], m[0][2], m[1][2], m[2][2])
	}
	setIdentity(): this {
		return this.identity()
	}
	multiplyVectorT(v: Vertex3D, recycle = false): Vertex3D {
		const e = this.elements
		const x = e[0] * v.x + e[1] * v.y + e[2] * v.z
		const y = e[3] * v.x + e[4] * v.y + e[5] * v.z
		const z = e[6] * v.x + e[7] * v.y + e[8] * v.z
		return recycle ? Vertex3D.claim(x, y, z) : new Vertex3D(x, y, z)
	}
	rotationAroundAxis(axis: Vertex3D, s: number, c: number): void {
		const { x, y, z } = axis
		const oc = 1 - c
		this.set(
			x * x + c * (1 - x * x),
			x * y * oc + z * s,
			z * x * oc - y * s,
			x * y * oc - z * s,
			y * y + c * (1 - y * y),
			y * z * oc + x * s,
			z * x * oc + y * s,
			y * z * oc - x * s,
			z * z + c * (1 - z * z),
		)
	}
	createSkewSymmetric(v: Vertex3D): this {
		this.set(0, -v.z, v.y, v.z, 0, -v.x, -v.y, v.x, 0)
		return this
	}
	override clone(): this {
		return new Matrix2D().copy(this) as unknown as this
	}
	clonePooled(recycle = false): Matrix2D {
		if (recycle) return Matrix2D.claim().copy(this) as Matrix2D
		return this.clone()
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
	): Matrix2D
	override set(m: Matrix2D): Matrix2D
	override set(...args: any[]): any {
		if (args.length === 1 && args[0] instanceof Matrix3) {
			this.copy(args[0])
			return this
		}
		return super.set(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8])
	}
	addMatrix(a: Matrix2D, b: Matrix2D): void {
		const ae = a.elements,
			be = b.elements,
			e = this.elements
		for (let i = 0; i < 9; i++) e[i] = ae[i]! + be[i]!
	}
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
	override toString(): string {
		const r = (n: number) => Math.round(n * 1000) / 1000
		const e = this.elements
		return `[${r(e[0])}, ${r(e[3])}, ${r(e[6])}]\n[${r(e[1])}, ${r(e[4])}, ${r(e[7])}]\n[${r(e[2])}, ${r(e[5])}, ${r(e[8])}]`
	}
}

/** 4×4 matrix, three.js based. */

export class Matrix3D extends Matrix4 {
	private static readonly _pooled = pooled(Matrix3D)
	static claim(): Matrix3D {
		return Matrix3D._pooled.claim()
	}
	static release(...ms: Matrix3D[]): void {
		Matrix3D._pooled.release(...ms)
	}
	static reset(m: Matrix3D): void {
		m.identity()
	}
	setIdentity(): this {
		return this.identity()
	}
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
		)
	}
	setEach(...m: number[]): this {
		this.set(m[0], m[4], m[8], m[12], m[1], m[5], m[9], m[13], m[2], m[6], m[10], m[14], m[3], m[7], m[11], m[15])
		return this
	}
	setTranslation(tx: number, ty: number, tz: number): this {
		this.identity()
		this.elements[12] = tx
		this.elements[13] = ty
		this.elements[14] = tz
		return this
	}
	setScaling(sx: number, sy: number, sz: number): this {
		this.identity()
		this.elements[0] = sx
		this.elements[5] = sy
		this.elements[10] = sz
		return this
	}
	rotateXMatrix(rad: number): this {
		this.makeRotationX(rad)
		return this
	}
	rotateYMatrix(rad: number): this {
		this.makeRotationY(rad)
		return this
	}
	rotateZMatrix(rad: number): this {
		this.makeRotationZ(rad)
		return this
	}
	override multiply(m: Matrix4): this {
		super.multiply(m)
		return this
	}
	preMultiply(a: Matrix3D): this {
		super.premultiply(a)
		return this
	}
	toRightHanded(): this {
		const m = Matrix3D.claim().setScaling(1, 1, -1)
		this.multiply(m)
		Matrix3D.release(m)
		return this
	}
	override clone(): this {
		return new Matrix3D().copy(this) as unknown as this
	}
	clonePooled(recycle = false): Matrix3D {
		if (recycle) return Matrix3D.claim().copy(this) as Matrix3D
		return this.clone()
	}
	get _11(): number {
		return this.elements[0]
	}
	set _11(v: number) {
		this.elements[0] = v
	}
	get _12(): number {
		return this.elements[1]
	}
	set _12(v: number) {
		this.elements[1] = v
	}
	get _13(): number {
		return this.elements[2]
	}
	set _13(v: number) {
		this.elements[2] = v
	}
	get _14(): number {
		return this.elements[3]
	}
	set _14(v: number) {
		this.elements[3] = v
	}
	get _21(): number {
		return this.elements[4]
	}
	set _21(v: number) {
		this.elements[4] = v
	}
	get _22(): number {
		return this.elements[5]
	}
	set _22(v: number) {
		this.elements[5] = v
	}
	get _23(): number {
		return this.elements[6]
	}
	set _23(v: number) {
		this.elements[6] = v
	}
	get _24(): number {
		return this.elements[7]
	}
	set _24(v: number) {
		this.elements[7] = v
	}
	get _31(): number {
		return this.elements[8]
	}
	set _31(v: number) {
		this.elements[8] = v
	}
	get _32(): number {
		return this.elements[9]
	}
	set _32(v: number) {
		this.elements[9] = v
	}
	get _33(): number {
		return this.elements[10]
	}
	set _33(v: number) {
		this.elements[10] = v
	}
	get _34(): number {
		return this.elements[11]
	}
	set _34(v: number) {
		this.elements[11] = v
	}
	get _41(): number {
		return this.elements[12]
	}
	set _41(v: number) {
		this.elements[12] = v
	}
	get _42(): number {
		return this.elements[13]
	}
	set _42(v: number) {
		this.elements[13] = v
	}
	get _43(): number {
		return this.elements[14]
	}
	set _43(v: number) {
		this.elements[14] = v
	}
	get _44(): number {
		return this.elements[15]
	}
	set _44(v: number) {
		this.elements[15] = v
	}
	get matrix(): number[][] {
		const e = this.elements
		return [
			[e[0], e[4], e[8], e[12]],
			[e[1], e[5], e[9], e[13]],
			[e[2], e[6], e[10], e[14]],
			[e[3], e[7], e[11], e[15]],
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
