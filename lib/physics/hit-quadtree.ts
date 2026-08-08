// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { EventProxy } from '../game/event-proxy.js'
import type { PlayerPhysics } from '../game/player-physics.js'
import { FRect3D } from '../util/frect3d.js'
import { Vertex3D } from '../util/math.js'
import type { Ball } from '../vpt/ball/ball.js'
import type { CollisionEvent } from './collision-event.js'
import type { HitObject } from './hit-object.js'

/** Quad-tree for broadphase.
 * @see https://github.com/vpinball/vpinball/blob/master/quadtree.cpp */
export class HitQuadtree {
	private unique?: EventProxy
	private vho: HitObject[] = []
	private children: HitQuadtree[] = []
	private vCenter = new Vertex3D()
	private isLeaf = true

	public addElement(pho: HitObject): void {
		this.vho.push(pho)
	}

	public initialize(bounds?: FRect3D): void {
		if (!bounds) {
			bounds = new FRect3D()
			for (const h of this.vho) bounds.extend(h.hitBBox)
		}
		this.createNextLevel(bounds, 0, 0)
	}

	public hitTestBall(ball: Ball, coll: CollisionEvent, physics: PlayerPhysics): void {
		const bBox = ball.hit.hitBBox
		const pos = ball.state.pos
		const radSq = ball.hit.rcHitRadiusSqr
		for (const h of this.vho) {
			if (ball.hit !== h && h.hitBBox.intersectRect(bBox) && h.hitBBox.intersectSphere(pos, radSq)) {
				h.doHitTest(ball, coll, physics)
			}
		}
		if (this.isLeaf) return
		const vcX = this.vCenter.x
		const vcY = this.vCenter.y
		const isLeft = bBox.left <= vcX
		const isRight = bBox.right >= vcX
		if (bBox.top <= vcY) {
			if (isLeft) this.children[0]?.hitTestBall(ball, coll, physics)
			if (isRight) this.children[1]?.hitTestBall(ball, coll, physics)
		}
		if (bBox.bottom >= vcY) {
			if (isLeft) this.children[2]?.hitTestBall(ball, coll, physics)
			if (isRight) this.children[3]?.hitTestBall(ball, coll, physics)
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
		this.unique = this.vho[0].isPrimitive ? this.vho[0].eventProxy : undefined
		for (const pho of this.vho) {
			if ((pho.isPrimitive ? pho.eventProxy : undefined) !== this.unique) this.unique = undefined
			let oct = 0
			if (pho.hitBBox.right < this.vCenter.x) oct = 0
			else if (pho.hitBBox.left > this.vCenter.x) oct = 1
			else oct = 128
			if (pho.hitBBox.bottom < this.vCenter.y) oct |= 0
			else if (pho.hitBBox.top > this.vCenter.y) oct |= 2
			else oct |= 128
			if ((oct & 128) === 0) this.children[oct].vho.push(pho)
			else remain.push(pho)
		}
		this.vho = remain
		let empty = this.vho.length === 0 ? 1 : 0
		for (let i = 0; i < 4; i++) if (!this.children[i].vho.length) empty++
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
				this.children[i].createNextLevel(b, level + 1, levelEmpty)
			}
		}
	}
}
