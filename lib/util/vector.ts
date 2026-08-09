// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { type Matrix3, Vector2, Vector3 } from 'three'
import { UNDEF } from '../scripting/vbs-undefined.js'
import { FLT_MIN } from './float.js'
import type { Matrix2D, Matrix3D } from './matrix.js'
import { pooled } from './object-pool.js'

export class Vertex2D extends Vector2 {
	static readonly _pooled = pooled(Vertex2D)
	static readonly POOL = Vertex2D._pooled.pool
	readonly isVector2 = true as const
	readonly isVector3 = false as const
	constructor(x?: number, y?: number) {
		super(x ?? 0, y ?? 0)
	}
	static claim(x?: number, y?: number): Vertex2D {
		return Vertex2D._pooled.claim().set(x ?? 0, y ?? 0)
	}
	static release(...vs: Vertex2D[]): void {
		Vertex2D._pooled.release(...vs)
	}
	static reset(v: Vertex2D): void {
		v.set(0, 0)
	}
	setZero(): this {
		return this.set(0, 0)
	}
	override clone(recycle = false): this {
		const v = recycle ? Vertex2D._pooled.claim().set(this.x, this.y) : new Vertex2D(this.x, this.y)
		return v as this
	}
	addAndRelease(v: Vertex2D): this {
		this.add(v)
		Vertex2D.release(v)
		return this
	}
	subAndRelease(v: Vertex2D): this {
		this.sub(v)
		Vertex2D.release(v)
		return this
	}
	equals(v?: Vertex2D): boolean {
		return !!v && this.x === v.x && this.y === v.y
	}
	toThree(): Vector2 {
		return new Vector2(this.x, this.y)
	}
	static fromThree(v: Vector2): Vertex2D {
		return new Vertex2D(v.x, v.y)
	}
	static get(buffer: Uint8Array): Vertex2D {
		const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
		return new Vertex2D(view.getFloat32(0, true), view.getFloat32(4, true))
	}
}

/** 3D single-precision vector, three.js based with pooling. */

export class Vertex3D extends Vector3 {
	static readonly _pooled = pooled(Vertex3D)
	static readonly POOL = Vertex3D._pooled.pool
	readonly isVector2 = false as const
	readonly isVector3 = true as const
	constructor(x?: number, y?: number, z?: number) {
		super(x ?? 0, y ?? 0, z ?? 0)
	}
	static claim(x?: number, y?: number, z?: number): Vertex3D {
		return Vertex3D._pooled.claim().set(x ?? 0, y ?? 0, z ?? 0)
	}
	static release(...vs: Vertex3D[]): void {
		Vertex3D._pooled.release(...vs)
	}
	static reset(v: Vertex3D): void {
		v.set(0, 0, 0)
	}
	override set(x: number, y: number, z?: number): this
	override set(v: Vector3): this
	override set(xOrV: number | Vector3, y?: number, z?: number): this {
		if ((xOrV as any)?.[UNDEF] === true) return super.set(0, 0, 0) as this
		if (typeof xOrV === 'number') {
			if ((y as any)?.[UNDEF] === true) y = 0 as any
			if ((z as any)?.[UNDEF] === true) z = 0 as any
			return super.set(xOrV as number, y as number, z ?? 0) as this
		}
		return super.set((xOrV as any)?.x ?? 0, (xOrV as any)?.y ?? 0, (xOrV as any)?.z ?? 0) as this
	}
	setAndRelease(v: Vertex3D): this {
		this.set(v)
		Vertex3D.release(v)
		return this
	}
	override clone(recycle = false): this {
		const v = recycle ? Vertex3D._pooled.claim().set(this.x, this.y, this.z) : new Vertex3D(this.x, this.y, this.z)
		return v as this
	}
	normalizeSafe(): void {
		if (!this.isZero()) this.normalize()
	}
	applyMatrix2D(m: Matrix2D): this {
		const e = (m as Matrix3).elements
		return this.set(
			e[0] * this.x + e[3] * this.y + e[6] * this.z,
			e[1] * this.x + e[4] * this.y + e[7] * this.z,
			e[2] * this.x + e[5] * this.y + e[8] * this.z,
		)
	}
	dotAndRelease(v: Vertex3D): number {
		const d = this.dot(v)
		Vertex3D.release(v)
		return d
	}
	subAndRelease(v: Vertex3D): this {
		this.sub(v)
		Vertex3D.release(v)
		return this
	}
	addAndRelease(v: Vertex3D): this {
		this.add(v)
		Vertex3D.release(v)
		return this
	}
	xy(): Vertex2D {
		return new Vertex2D(this.x, this.y)
	}
	setZero(): this {
		return this.set(0, 0, 0)
	}
	isZero(): boolean {
		return Math.abs(this.x) < FLT_MIN && Math.abs(this.y) < FLT_MIN && Math.abs(this.z) < FLT_MIN
	}
	equals(v: Vector3): boolean {
		return v.x === this.x && v.y === this.y && v.z === this.z
	}
	static crossProduct(a: Vertex3D, b: Vertex3D, recycle = false): Vertex3D {
		const out = new Vector3().crossVectors(a, b)
		return recycle ? Vertex3D.claim(out.x, out.y, out.z) : new Vertex3D(out.x, out.y, out.z)
	}
	static crossZ(rz: number, v: Vertex3D, recycle = false): Vertex3D {
		return recycle ? Vertex3D.claim(-rz * v.y, rz * v.x, 0) : new Vertex3D(-rz * v.y, rz * v.x, 0)
	}
	static getRotatedAxis(angle: number, axis: Vertex3D, temp: Vertex3D): Vertex3D {
		const u = axis.clone().normalize()
		const rad = (Math.PI / 180) * angle
		const s = Math.sin(rad)
		const c = Math.cos(rad)
		const omc = 1 - c
		const r0 = new Vertex3D(u.x * u.x + c * (1 - u.x * u.x), u.x * u.y * omc - s * u.z, u.x * u.z * omc + s * u.y)
		const r1 = new Vertex3D(u.x * u.y * omc + s * u.z, u.y * u.y + c * (1 - u.y * u.y), u.y * u.z * omc - s * u.x)
		const r2 = new Vertex3D(u.x * u.z * omc - s * u.y, u.y * u.z * omc + s * u.x, u.z * u.z + c * (1 - u.z * u.z))
		Vertex3D.release(u)
		return new Vertex3D(temp.dot(r0), temp.dot(r1), temp.dot(r2))
	}
	multiplyMatrix(m: Matrix3D): this {
		const e = (m as unknown as { elements: number[] }).elements
		if (!e) {
			const x = this.x,
				y = this.y,
				z = this.z
			const xp = m._11 * x + m._21 * y + m._31 * z + m._41
			const yp = m._12 * x + m._22 * y + m._32 * z + m._42
			const zp = m._13 * x + m._23 * y + m._33 * z + m._43
			const wp = m._14 * x + m._24 * y + m._34 * z + m._44
			const inv = 1 / wp
			return this.set(xp * inv, yp * inv, zp * inv)
		}
		const x = this.x,
			y = this.y,
			z = this.z
		const xp = e[0] * x + e[4] * y + e[8] * z + e[12]
		const yp = e[1] * x + e[5] * y + e[9] * z + e[13]
		const zp = e[2] * x + e[6] * y + e[10] * z + e[14]
		const wp = e[3] * x + e[7] * y + e[11] * z + e[15]
		const inv = 1 / wp
		return this.set(xp * inv, yp * inv, zp * inv)
	}
	multiplyMatrixNoTranslate(m: Matrix3D): this {
		const e = (m as unknown as { elements: number[] }).elements
		if (!e) {
			const xp = m._11 * this.x + m._21 * this.y + m._31 * this.z
			const yp = m._12 * this.x + m._22 * this.y + m._32 * this.z
			const zp = m._13 * this.x + m._23 * this.y + m._33 * this.z
			return this.set(xp, yp, zp)
		}
		const xp = e[0] * this.x + e[4] * this.y + e[8] * this.z
		const yp = e[1] * this.x + e[5] * this.y + e[9] * this.z
		const zp = e[2] * this.x + e[6] * this.y + e[10] * this.z
		return this.set(xp, yp, zp)
	}
	toThree(): Vector3 {
		return new Vector3(this.x, this.y, this.z)
	}
	static fromThree(v: Vector3): Vertex3D {
		return new Vertex3D(v.x, v.y, v.z)
	}
	static get(buffer: Uint8Array): Vertex3D {
		const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
		const v = new Vertex3D(view.getFloat32(0, true), view.getFloat32(4, true))
		if (buffer.length >= 12) v.z = view.getFloat32(8, true)
		return v
	}
	static from(data: Record<string, unknown>): Vertex3D {
		return Object.assign(new Vertex3D(), data)
	}
}
