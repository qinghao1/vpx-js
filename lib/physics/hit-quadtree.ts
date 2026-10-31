// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { PlayerPhysics } from '../game/player-physics.js'
import { FRect3D } from '../math/bounds.js'
import { Vertex3D } from '../math/vector.js'
import type { Ball } from '../vpt/ball/ball.js'
import type { CollisionEvent } from './collision-event.js'
import type { HitObject } from './hit-object.js'
import { BatchCollector, countBatchables } from './wasm/batched-hittest.js'
import { getWasmKernels, isWasmReady, warmWasmPools } from './wasm/kernels.js'

/** @see https://github.com/vpinball/vpinball/blob/master/src/physics/quadtree.cpp */
export class HitQuadtree {
	private vho: HitObject[] = []
	private children: HitQuadtree[] = []
	private vCenter = new Vertex3D()
	private isLeaf = true

	private batches = new BatchCollector()

	public addElement(o: HitObject): void {
		this.vho.push(o)
	}

	public initialize(b?: FRect3D): void {
		if (!b) {
			b = new FRect3D()
			for (const h of this.vho) b.extend(h.hitBBox)
		}
		const warm = () => {
			const counts = countBatchables(this.vho)
			if (counts.some(count => count)) warmWasmPools(...counts)
		}
		if (isWasmReady()) warm()
		else void getWasmKernels().then(warm)
		this.createNextLevel(b, 0, 0)
	}

	public hitTestBall(ball: Ball, coll: CollisionEvent, physics: PlayerPhysics): void {
		if (!isWasmReady()) return this.hitTestBallScalar(ball, coll, physics)
		// Empty collect provably finds nothing on re-walk: same bbox cull as the
		// scalar walk, and traverse only skips abortHitTest, which doHitTest re-checks.
		if (!this.collect(ball)) return
		if (!this.batches.run(ball, coll, physics)) this.hitTestBallScalar(ball, coll, physics)
	}

	private hitTestBallScalar(ball: Ball, coll: CollisionEvent, physics: PlayerPhysics): void {
		const b = ball.hit.hitBBox,
			pos = ball.state.pos,
			rs = ball.hit.rcHitRadiusSqr
		for (let i = 0; i < this.vho.length; i++) {
			const h = this.vho[i]!
			if (h !== ball.hit && h.isEnabled && h.hitBBox.intersectRect(b) && h.hitBBox.intersectSphere(pos, rs))
				h.doHitTest(ball, coll, physics)
		}
		if (this.isLeaf) return
		const { x, y } = this.vCenter,
			left = b.left <= x,
			right = b.right >= x
		if (b.top <= y) {
			if (left) this.children[0]?.hitTestBall(ball, coll, physics)
			if (right) this.children[1]?.hitTestBall(ball, coll, physics)
		}
		if (b.bottom >= y) {
			if (left) this.children[2]?.hitTestBall(ball, coll, physics)
			if (right) this.children[3]?.hitTestBall(ball, coll, physics)
		}
	}

	private collect(ball: Ball): boolean {
		this.batches.reset()
		this.traverse(this, ball)
		return this.batches.orderLen > 0
	}

	private traverse(node: HitQuadtree, ball: Ball): void {
		for (let i = 0; i < node.vho.length; i++) {
			const h = node.vho[i]!
			if (h === ball.hit || !h.isEnabled) continue
			if (
				!h.hitBBox.intersectRect(ball.hit.hitBBox) ||
				!h.hitBBox.intersectSphere(ball.state.pos, ball.hit.rcHitRadiusSqr)
			)
				continue
			// Veto last: abortHitTest is a virtual call, and culled candidates
			// never reach doHitTest either way, so skipping it on misses only
			// drops calls, never hits (doHitTest re-checks it for survivors).
			if (h.obj?.abortHitTest?.()) continue
			this.batches.classify(h)
		}
		if (node.isLeaf) return
		const b = ball.hit.hitBBox,
			{ x, y } = node.vCenter,
			left = b.left <= x,
			right = b.right >= x
		if (b.top <= y) {
			if (left && node.children[0]) this.traverse(node.children[0], ball)
			if (right && node.children[1]) this.traverse(node.children[1], ball)
		}
		if (b.bottom >= y) {
			if (left && node.children[2]) this.traverse(node.children[2], ball)
			if (right && node.children[3]) this.traverse(node.children[3], ball)
		}
	}

	private createNextLevel(bounds: FRect3D, level: number, levelEmpty: number): void {
		if (this.vho.length <= 4) return
		this.isLeaf = false
		this.vCenter.x = (bounds.left + bounds.right) * 0.5
		this.vCenter.y = (bounds.top + bounds.bottom) * 0.5
		this.vCenter.z = (bounds.zlow + bounds.zhigh) * 0.5
		for (let i = 0; i < 4; i++) this.children[i] = new HitQuadtree()
		const remain: HitObject[] = []
		for (const o of this.vho) {
			let oct = 0
			if (o.hitBBox.right < this.vCenter.x) oct = 0
			else if (o.hitBBox.left > this.vCenter.x) oct = 1
			else oct = 128
			if (o.hitBBox.bottom < this.vCenter.y) oct |= 0
			else if (o.hitBBox.top > this.vCenter.y) oct |= 2
			else oct |= 128
			if ((oct & 128) === 0) this.children[oct]!.vho.push(o)
			else remain.push(o)
		}
		this.vho = remain
		let empty = this.vho.length === 0 ? 1 : 0
		for (let i = 0; i < 4; i++) if (!this.children[i]!.vho.length) empty++
		if (empty >= 4) levelEmpty++
		else levelEmpty = 0
		if (this.vCenter.x - bounds.left > 0.0001 && levelEmpty <= 8 && level + 1 < 128 / 3) {
			for (let i = 0; i < 4; i++) {
				const b = new FRect3D()
				b.left = i & 1 ? this.vCenter.x : bounds.left
				b.top = i & 2 ? this.vCenter.y : bounds.top
				b.zlow = bounds.zlow
				b.right = i & 1 ? bounds.right : this.vCenter.x
				b.bottom = i & 2 ? bounds.bottom : this.vCenter.y
				b.zhigh = bounds.zhigh
				this.children[i]!.createNextLevel(b, level + 1, levelEmpty)
			}
		}
	}
}
