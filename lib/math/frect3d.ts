// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { FLT_MAX } from '../vpt/mesh.js'
import type { Vertex3D } from './vertex3d.js'

/** Axis-aligned 3D bounding box. */
export class FRect3D {
	public left = 0
	public top = 0
	public right = 0
	public bottom = 0
	public zlow = 0
	public zhigh = 0

	get width(): number {
		return Math.abs(this.left - this.right)
	}
	get height(): number {
		return Math.abs(this.top - this.bottom)
	}
	get depth(): number {
		return Math.abs(this.zlow - this.zhigh)
	}

	constructor(left?: number, right?: number, top?: number, bottom?: number, zLow?: number, zHigh?: number) {
		if (
			left !== undefined &&
			right !== undefined &&
			top !== undefined &&
			bottom !== undefined &&
			zLow !== undefined &&
			zHigh !== undefined
		) {
			this.left = left
			this.right = right
			this.top = top
			this.bottom = bottom
			this.zlow = zLow
			this.zhigh = zHigh
		} else {
			this.clear()
		}
	}

	public clear(): void {
		this.left = FLT_MAX
		this.right = -FLT_MAX
		this.top = FLT_MAX
		this.bottom = -FLT_MAX
		this.zlow = FLT_MAX
		this.zhigh = -FLT_MAX
	}

	/** Alias for `clear()` (keeps legacy call sites working). */
	public Clear(): void {
		this.clear()
	}

	public extend(o: FRect3D): void {
		this.left = Math.min(this.left, o.left)
		this.right = Math.max(this.right, o.right)
		this.top = Math.min(this.top, o.top)
		this.bottom = Math.max(this.bottom, o.bottom)
		this.zlow = Math.min(this.zlow, o.zlow)
		this.zhigh = Math.max(this.zhigh, o.zhigh)
	}

	public intersectSphere(p: Vertex3D, rSq: number): boolean {
		let ex = Math.max(this.left - p.x, 0) + Math.max(p.x - this.right, 0)
		let ey = Math.max(this.top - p.y, 0) + Math.max(p.y - this.bottom, 0)
		let ez = Math.max(this.zlow - p.z, 0) + Math.max(p.z - this.zhigh, 0)
		ex *= ex
		ey *= ey
		ez *= ez
		return ex + ey + ez <= rSq
	}

	public intersectRect(rc: FRect3D): boolean {
		return (
			this.right >= rc.left &&
			this.bottom >= rc.top &&
			this.left <= rc.right &&
			this.top <= rc.bottom &&
			this.zlow <= rc.zhigh &&
			this.zhigh >= rc.zlow
		)
	}
}
