// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Box3 } from 'three'
import type { Vertex3D } from './vector.js'

export class FRect3D extends Box3 {
	constructor(left?: number, right?: number, top?: number, bottom?: number, zLow?: number, zHigh?: number) {
		super()
		if (
			left !== undefined &&
			right !== undefined &&
			top !== undefined &&
			bottom !== undefined &&
			zLow !== undefined &&
			zHigh !== undefined
		) {
			this.min.set(left, top, zLow)
			this.max.set(right, bottom, zHigh)
		} else {
			this.makeEmpty()
		}
	}
	get left(): number {
		return this.min.x
	}
	set left(v: number) {
		this.min.x = v
	}
	get right(): number {
		return this.max.x
	}
	set right(v: number) {
		this.max.x = v
	}
	get top(): number {
		return this.min.y
	}
	set top(v: number) {
		this.min.y = v
	}
	get bottom(): number {
		return this.max.y
	}
	set bottom(v: number) {
		this.max.y = v
	}
	get zlow(): number {
		return this.min.z
	}
	set zlow(v: number) {
		this.min.z = v
	}
	get zhigh(): number {
		return this.max.z
	}
	set zhigh(v: number) {
		this.max.z = v
	}
	clear(): void {
		this.makeEmpty()
	}
	extend(o: FRect3D): void {
		this.union(o)
	}
	toBox3(): Box3 {
		return new Box3().copy(this)
	}
	static fromBox3(b: Box3): FRect3D {
		return new FRect3D().copy(b) as FRect3D
	}
	override clone(): this {
		return new FRect3D().copy(this) as this
	}
	intersectSphere(p: Vertex3D, rSq: number): boolean {
		const ex = Math.max(this.min.x - p.x, 0) + Math.max(p.x - this.max.x, 0)
		const ey = Math.max(this.min.y - p.y, 0) + Math.max(p.y - this.max.y, 0)
		const ez = Math.max(this.min.z - p.z, 0) + Math.max(p.z - this.max.z, 0)
		return ex * ex + ey * ey + ez * ez <= rSq
	}
	intersectRect(o: FRect3D): boolean {
		return this.intersectsBox(o)
	}
}
