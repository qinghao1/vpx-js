// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { PlayerPhysics } from '../game/player-physics.js'
import { FRect3D } from '../util/frect3d.js'
import { Vertex3D } from '../util/math.js'
import type { Ball } from '../vpt/ball/ball.js'
import type { CollisionEvent } from './collision-event.js'
import type { HitKD } from './hit-kd.js'

/** KD-tree node. @see https://github.com/vpinball/vpinball/blob/master/hitoctree.cpp */
export class HitKDNode {
	private hitOct: HitKD
	public rectBounds = new FRect3D()
	public start = 0
	public items = 0
	private children: HitKDNode[] = []

	constructor(hitOct: HitKD) {
		this.hitOct = hitOct
	}

	public reset(hitOct: HitKD): void {
		this.children.length = 0
		this.hitOct = hitOct
		this.start = 0
		this.items = 0
	}

	public hitTestBall(ball: Ball, coll: CollisionEvent, physics: PlayerPhysics): void {
		const n = this.items & 0x3fffffff
		const axis = this.items >> 30
		for (let i = this.start; i < this.start + n; i++) {
			const o = this.hitOct.getItemAt(i)
			if (ball.hit !== o && o.hitBBox.intersectSphere(ball.state.pos, ball.hit.rcHitRadiusSqr))
				o.doHitTest(ball, coll, physics)
		}
		if (!this.children.length) return
		const r = this.rectBounds
		const b = ball.hit.hitBBox
		if (axis === 0) {
			const c = (r.left + r.right) * 0.5
			if (b.left <= c) this.children[0].hitTestBall(ball, coll, physics)
			if (b.right >= c) this.children[1].hitTestBall(ball, coll, physics)
		} else if (axis === 1) {
			const c = (r.top + r.bottom) * 0.5
			if (b.top <= c) this.children[0].hitTestBall(ball, coll, physics)
			if (b.bottom >= c) this.children[1].hitTestBall(ball, coll, physics)
		} else {
			const c = (r.zlow + r.zhigh) * 0.5
			if (b.zlow <= c) this.children[0].hitTestBall(ball, coll, physics)
			if (b.zhigh >= c) this.children[1].hitTestBall(ball, coll, physics)
		}
	}

	public createNextLevel(level: number, levelEmpty: number): void {
		const org = this.items & 0x3fffffff
		if (org <= 4 || level >= 64) return
		const d = Vertex3D.claim(
			this.rectBounds.right - this.rectBounds.left,
			this.rectBounds.bottom - this.rectBounds.top,
			this.rectBounds.zhigh - this.rectBounds.zlow,
		)
		let axis: number
		if (d.x > d.y && d.x > d.z) {
			if (d.x < 1e-4) {
				Vertex3D.release(d)
				return
			}
			axis = 0
		} else if (d.y > d.z) {
			if (d.y < 1e-4) {
				Vertex3D.release(d)
				return
			}
			axis = 1
		} else {
			if (d.z < 1e-4) {
				Vertex3D.release(d)
				return
			}
			axis = 2
		}
		Vertex3D.release(d)
		this.children = this.hitOct.allocTwoNodes()
		if (!this.children.length) return
		this.children[0].rectBounds = this.rectBounds
		this.children[1].rectBounds = this.rectBounds
		const vc = Vertex3D.claim(
			(this.rectBounds.left + this.rectBounds.right) * 0.5,
			(this.rectBounds.top + this.rectBounds.bottom) * 0.5,
			(this.rectBounds.zlow + this.rectBounds.zhigh) * 0.5,
		)
		if (axis === 0) {
			this.children[0].rectBounds.right = vc.x
			this.children[1].rectBounds.left = vc.x
		} else if (axis === 1) {
			this.children[0].rectBounds.bottom = vc.y
			this.children[1].rectBounds.top = vc.y
		} else {
			this.children[0].rectBounds.zhigh = vc.z
			this.children[1].rectBounds.zlow = vc.z
		}
		for (const ch of this.children) {
			ch.hitOct = this.hitOct
			ch.items = 0
			ch.children.length = 0
		}
		if (axis === 0) {
			for (let i = this.start; i < this.start + org; i++) {
				const h = this.hitOct.getItemAt(i).hitBBox
				if (h.right < vc.x) this.children[0].items++
				else if (h.left > vc.x) this.children[1].items++
			}
		} else if (axis === 1) {
			for (let i = this.start; i < this.start + org; i++) {
				const h = this.hitOct.getItemAt(i).hitBBox
				if (h.bottom < vc.y) this.children[0].items++
				else if (h.top > vc.y) this.children[1].items++
			}
		} else {
			for (let i = this.start; i < this.start + org; i++) {
				const h = this.hitOct.getItemAt(i).hitBBox
				if (h.zhigh < vc.z) this.children[0].items++
				else if (h.zlow > vc.z) this.children[1].items++
			}
		}
		const leftCount = this.children[0].items
		const rightCount = this.children[1].items
		if (leftCount === 0 && rightCount === 0) {
			Vertex3D.release(vc)
			return
		}
		this.items = (axis << 30) | org
		const tmp = this.hitOct.tmp
		let l = this.start
		let r = this.start + org - 1
		for (let i = this.start; i < this.start + org; i++) {
			const idx = this.hitOct.orgIdx[i]
			const h = this.hitOct.getItemAt(i).hitBBox
			let side = -1
			if (axis === 0) side = h.right < vc.x ? 0 : h.left > vc.x ? 1 : -1
			else if (axis === 1) side = h.bottom < vc.y ? 0 : h.top > vc.y ? 1 : -1
			else side = h.zhigh < vc.z ? 0 : h.zlow > vc.z ? 1 : -1
			if (side === 0) tmp[l++] = idx
			else if (side === 1) tmp[r--] = idx
		}
		for (let i = this.start; i < l; i++) this.hitOct.orgIdx[i] = tmp[i]
		for (let i = r + 1; i < this.start + org; i++) this.hitOct.orgIdx[i] = tmp[i]
		this.children[0].start = this.start
		this.children[0].items = leftCount
		this.children[1].start = this.start + org - rightCount
		this.children[1].items = rightCount
		Vertex3D.release(vc)
		this.children[0].createNextLevel(level + 1, levelEmpty)
		this.children[1].createNextLevel(level + 1, levelEmpty)
	}
}
