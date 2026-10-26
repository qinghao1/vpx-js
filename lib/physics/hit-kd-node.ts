// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { PlayerPhysics } from '../game/player-physics.js'
import { FRect3D } from '../math/bounds.js'
import type { Ball } from '../vpt/ball/ball.js'
import type { CollisionEvent } from './collision-event.js'
import type { HitKD } from './hit-kd.js'
import { BatchCollector } from './wasm/batched-hittest.js'
import { isWasmReady } from './wasm/kernels.js'

const COUNT_MASK = 0x3fffffff
const AXIS_SHIFT = 30

/** @see https://github.com/vpinball/vpinball/blob/master/src/physics/kdtree.cpp */
export class HitKDNode {
	public rectBounds = new FRect3D()
	public start = 0
	public items = 0
	private children: HitKDNode[] = []

	private batches = new BatchCollector()

	constructor(private hitOct: HitKD) {}
	public reset(o: HitKD): void {
		this.children.length = 0
		this.hitOct = o
		this.start = 0
		this.items = 0
	}

	public hitTestBall(ball: Ball, coll: CollisionEvent, physics: PlayerPhysics): void {
		if (!isWasmReady()) return this.hitTestBallScalar(ball, coll, physics)
		if (!this.collect(ball)) return this.hitTestBallScalar(ball, coll, physics)
		if (!this.batches.run(ball, coll, physics)) this.hitTestBallScalar(ball, coll, physics)
	}

	private hitTestBallScalar(ball: Ball, coll: CollisionEvent, physics: PlayerPhysics): void {
		const count = this.items & COUNT_MASK
		for (let i = this.start; i < this.start + count; i++) {
			const h = this.hitOct.getItemAt(i)
			if (h !== ball.hit && h.isEnabled) h.doHitTest(ball, coll, physics)
		}
		if (this.children.length === 0) return
		const axis = this.items >> AXIS_SHIFT,
			bounds = this.rectBounds,
			box = ball.hit.hitBBox
		if (axis === 0) {
			const center = (bounds.left + bounds.right) * 0.5
			if (box.left <= center) this.children[0]?.hitTestBall(ball, coll, physics)
			if (box.right >= center) this.children[1]?.hitTestBall(ball, coll, physics)
		} else if (axis === 1) {
			const center = (bounds.top + bounds.bottom) * 0.5
			if (box.top <= center) this.children[0]?.hitTestBall(ball, coll, physics)
			if (box.bottom >= center) this.children[1]?.hitTestBall(ball, coll, physics)
		} else {
			const center = (bounds.zlow + bounds.zhigh) * 0.5
			if (box.zlow <= center) this.children[0]?.hitTestBall(ball, coll, physics)
			if (box.zhigh >= center) this.children[1]?.hitTestBall(ball, coll, physics)
		}
	}

	private collect(ball: Ball): boolean {
		this.batches.reset()
		this.traverse(this, ball)
		return this.batches.orderLen > 0
	}

	private traverse(node: HitKDNode, ball: Ball): void {
		const r = node.rectBounds,
			b = ball.hit.hitBBox,
			pos = ball.state.pos,
			rs = ball.hit.rcHitRadiusSqr
		if (!r.intersectRect(b) || !r.intersectSphere(pos, rs)) return
		const count = node.items & COUNT_MASK
		for (let i = node.start; i < node.start + count; i++) {
			const h = node.hitOct.getItemAt(i)
			if (h === ball.hit || h.obj?.abortHitTest?.() || !h.isEnabled) continue
			if (!h.hitBBox.intersectRect(b) || !h.hitBBox.intersectSphere(pos, rs)) continue
			this.batches.classify(h)
		}
		if (node.children.length === 0) return
		const axis = node.items >> AXIS_SHIFT
		if (axis === 0) {
			const cc = (r.left + r.right) * 0.5
			if (b.left <= cc) this.traverse(node.children[0]!, ball)
			if (b.right >= cc) this.traverse(node.children[1]!, ball)
		} else if (axis === 1) {
			const cc = (r.top + r.bottom) * 0.5
			if (b.top <= cc) this.traverse(node.children[0]!, ball)
			if (b.bottom >= cc) this.traverse(node.children[1]!, ball)
		} else {
			const cc = (r.zlow + r.zhigh) * 0.5
			if (b.zlow <= cc) this.traverse(node.children[0]!, ball)
			if (b.zhigh >= cc) this.traverse(node.children[1]!, ball)
		}
	}

	public createNextLevel(level: number, levelEmpty: number): void {
		const org = this.items & COUNT_MASK
		if (org <= 4 || level >= 64) return
		const dx = this.rectBounds.right - this.rectBounds.left
		const dy = this.rectBounds.bottom - this.rectBounds.top
		const dz = this.rectBounds.zhigh - this.rectBounds.zlow
		let axis: number
		if (dx > dy && dx > dz) {
			if (dx < 1e-4) return
			axis = 0
		} else if (dy > dz) {
			if (dy < 1e-4) return
			axis = 1
		} else {
			if (dz < 1e-4) return
			axis = 2
		}
		this.children = this.hitOct.allocTwoNodes()
		if (!this.children.length) return
		this.children[0].rectBounds = this.rectBounds.clone()
		this.children[1].rectBounds = this.rectBounds.clone()
		const vcX = (this.rectBounds.left + this.rectBounds.right) * 0.5
		const vcY = (this.rectBounds.top + this.rectBounds.bottom) * 0.5
		const vcZ = (this.rectBounds.zlow + this.rectBounds.zhigh) * 0.5
		if (axis === 0) {
			this.children[0].rectBounds.right = vcX
			this.children[1].rectBounds.left = vcX
		} else if (axis === 1) {
			this.children[0].rectBounds.bottom = vcY
			this.children[1].rectBounds.top = vcY
		} else {
			this.children[0].rectBounds.zhigh = vcZ
			this.children[1].rectBounds.zlow = vcZ
		}
		for (const ch of this.children) {
			ch.hitOct = this.hitOct
			ch.items = 0
			ch.children.length = 0
		}
		if (axis === 0) {
			for (let i = this.start; i < this.start + org; i++) {
				const h = this.hitOct.getItemAt(i).hitBBox
				if (h.right < vcX) this.children[0].items++
				else if (h.left > vcX) this.children[1].items++
			}
		} else if (axis === 1) {
			for (let i = this.start; i < this.start + org; i++) {
				const h = this.hitOct.getItemAt(i).hitBBox
				if (h.bottom < vcY) this.children[0].items++
				else if (h.top > vcY) this.children[1].items++
			}
		} else {
			for (let i = this.start; i < this.start + org; i++) {
				const h = this.hitOct.getItemAt(i).hitBBox
				if (h.zhigh < vcZ) this.children[0].items++
				else if (h.zlow > vcZ) this.children[1].items++
			}
		}
		const leftCount = this.children[0].items,
			rightCount = this.children[1].items
		let levelEmptyLocal = levelEmpty,
			middleCount = org - leftCount - rightCount,
			countEmpty = 0
		if (leftCount === 0) countEmpty++
		if (rightCount === 0) countEmpty++
		if (middleCount === 0) countEmpty++
		if (countEmpty >= 2) levelEmptyLocal++
		else levelEmptyLocal = 0
		if (levelEmptyLocal > 8) {
			this.hitOct.numNodes -= 2
			this.children.length = 0
			return
		}
		this.children[0].start = this.start + middleCount
		this.children[1].start = this.children[0].start + leftCount
		let middle = 0
		this.children[0].items = 0
		this.children[1].items = 0
		if (axis === 0) {
			for (let i = this.start; i < this.start + org; i++) {
				const idx = this.hitOct.orgIdx[i]!
				const h = this.hitOct.getItemAt(i).hitBBox
				if (h.right < vcX) this.hitOct.tmp[this.children[0].start + this.children[0].items++] = idx
				else if (h.left > vcX) this.hitOct.tmp[this.children[1].start + this.children[1].items++] = idx
				else this.hitOct.orgIdx[this.start + middle++] = idx
			}
		} else if (axis === 1) {
			for (let i = this.start; i < this.start + org; i++) {
				const idx = this.hitOct.orgIdx[i]!
				const h = this.hitOct.getItemAt(i).hitBBox
				if (h.bottom < vcY) this.hitOct.tmp[this.children[0].start + this.children[0].items++] = idx
				else if (h.top > vcY) this.hitOct.tmp[this.children[1].start + this.children[1].items++] = idx
				else this.hitOct.orgIdx[this.start + middle++] = idx
			}
		} else {
			for (let i = this.start; i < this.start + org; i++) {
				const idx = this.hitOct.orgIdx[i]!
				const h = this.hitOct.getItemAt(i).hitBBox
				if (h.zhigh < vcZ) this.hitOct.tmp[this.children[0].start + this.children[0].items++] = idx
				else if (h.zlow > vcZ) this.hitOct.tmp[this.children[1].start + this.children[1].items++] = idx
				else this.hitOct.orgIdx[this.start + middle++] = idx
			}
		}
		this.items = middle | (axis << AXIS_SHIFT)
		if (this.children[0].items > 0)
			for (let i = 0; i < this.children[0].items; i++)
				this.hitOct.orgIdx[this.children[0].start + i] = this.hitOct.tmp[this.children[0].start + i]!
		if (this.children[1].items > 0)
			for (let i = 0; i < this.children[1].items; i++)
				this.hitOct.orgIdx[this.children[1].start + i] = this.hitOct.tmp[this.children[1].start + i]!
		this.children[0].createNextLevel(level + 1, levelEmptyLocal)
		this.children[1].createNextLevel(level + 1, levelEmptyLocal)
	}
}
