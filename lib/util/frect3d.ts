// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { FLT_MAX } from '../vpt/mesh.js'
import type { Vertex3D } from './math.js'

/** Axis-aligned 3D bounding box. */
export class FRect3D {
	left = FLT_MAX
	top = FLT_MAX
	right = -FLT_MAX
	bottom = -FLT_MAX
	zlow = FLT_MAX
	zhigh = -FLT_MAX

	/** Width (right - left). */
	get width(): number {
		return Math.abs(this.left - this.right)
	}

	/** Height (bottom - top). */
	get height(): number {
		return Math.abs(this.top - this.bottom)
	}

	/** Depth (zhigh - zlow). */
	get depth(): number {
		return Math.abs(this.zlow - this.zhigh)
	}

	/** Creates bounds or an empty (inverted) box. */
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
		}
	}

	/** Resets to inverted bounds. */
	clear(): void {
		this.left = FLT_MAX
		this.right = -FLT_MAX
		this.top = FLT_MAX
		this.bottom = -FLT_MAX
		this.zlow = FLT_MAX
		this.zhigh = -FLT_MAX
	}

	/** Legacy alias for clear(). */
	Clear(): void {
		this.clear()
	}

	/** Expands to include other. */
	extend(o: FRect3D): void {
		this.left = Math.min(this.left, o.left)
		this.right = Math.max(this.right, o.right)
		this.top = Math.min(this.top, o.top)
		this.bottom = Math.max(this.bottom, o.bottom)
		this.zlow = Math.min(this.zlow, o.zlow)
		this.zhigh = Math.max(this.zhigh, o.zhigh)
	}

	/** Tests sphere intersection (rSq = radius²). */
	intersectSphere(p: Vertex3D, rSq: number): boolean {
		const ex = Math.max(this.left - p.x, 0) + Math.max(p.x - this.right, 0)
		const ey = Math.max(this.top - p.y, 0) + Math.max(p.y - this.bottom, 0)
		const ez = Math.max(this.zlow - p.z, 0) + Math.max(p.z - this.zhigh, 0)
		return ex * ex + ey * ey + ez * ez <= rSq
	}

	/** Tests AABB overlap. */
	intersectRect(o: FRect3D): boolean {
		return (
			this.right >= o.left &&
			this.bottom >= o.top &&
			this.left <= o.right &&
			this.top <= o.bottom &&
			this.zlow <= o.zhigh &&
			this.zhigh >= o.zlow
		)
	}
}
