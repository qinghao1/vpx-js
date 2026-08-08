// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { EventProxy } from '../game/event-proxy.js'
import type { PlayerPhysics } from '../game/player-physics.js'
import { FRect3D } from '../util/frect3d.js'
import { Vertex3D } from '../util/math.js'
import type { Ball } from '../vpt/ball/ball.js'
import { CollisionEvent } from './collision-event.js'
import type { HitObject } from './hit-object.js'
import { CollisionType } from './collision-type.js'
import { HitCircle } from './hit-circle.js'
import { HitPlane } from './hit-plane.js'
import { HitLineZ } from './hit-line-z.js'
import { HitLine3D } from './hit-line-3d.js'
import { getWasmBatchHitViewsOutCircle, getWasmBatchHitViewsOutPlane, getWasmBatchHitViewsOutLineZ, isWasmReady } from './wasm/kernels.js'

/** Quad-tree for broadphase.
 * @see https://github.com/vpinball/vpinball/blob/master/quadtree.cpp */
export class HitQuadtree {
	private unique?: EventProxy
	private vho: HitObject[] = []
	private children: HitQuadtree[] = []
	private vCenter = new Vertex3D()
	private isLeaf = true
	private _circles: HitCircle[] = []
	private _planes: HitPlane[] = []
	private _lineZs: HitLineZ[] = []
	private _order: Array<{ obj: HitObject; kind: 'circle' | 'plane' | 'lineZ' | 'other'; idx: number }> = []
	private _orderLen = 0

	public addElement(pho: HitObject): void { this.vho.push(pho) }

	public initialize(bounds?: FRect3D): void {
		if (!bounds) { bounds = new FRect3D(); for (const h of this.vho) bounds.extend(h.hitBBox) }
		this.createNextLevel(bounds, 0, 0)
	}

	public hitTestBall(ball: Ball, coll: CollisionEvent, physics: PlayerPhysics): void {
		if (!isWasmReady()) { this.hitTestBallScalar(ball, coll, physics); return }
		if (!this.collect(ball)) return
		const circles = this._circles
		const planes = this._planes
		const lineZs = this._lineZs
		let cv: ReturnType<typeof getWasmBatchHitViewsOutCircle> | null = null
		let pv: ReturnType<typeof getWasmBatchHitViewsOutPlane> | null = null
		let lv: ReturnType<typeof getWasmBatchHitViewsOutLineZ> | null = null
		if (circles.length) {
			cv = getWasmBatchHitViewsOutCircle(circles.length)
			for (let i = 0; i < circles.length; i++) { const h = circles[i]!; cv.cx[i] = h.center.x; cv.cy[i] = h.center.y; cv.cr[i] = h.radius; cv.zl[i] = h.hitBBox.zlow; cv.zh[i] = h.hitBBox.zhigh }
			cv.run(ball.state.pos.x, ball.state.pos.y, ball.state.pos.z, ball.hit.vel.x, ball.hit.vel.y, ball.hit.vel.z, ball.data.radius, coll.hitTime)
		}
		if (planes.length) {
			pv = getWasmBatchHitViewsOutPlane(planes.length)
			for (let i = 0; i < planes.length; i++) { const h = planes[i]! as unknown as { normal: Vertex3D; d: number }; pv.nx[i] = h.normal.x; pv.ny[i] = h.normal.y; pv.nz[i] = h.normal.z; pv.d[i] = h.d }
			pv.run(ball.state.pos.x, ball.state.pos.y, ball.state.pos.z, ball.hit.vel.x, ball.hit.vel.y, ball.hit.vel.z, ball.data.radius, coll.hitTime)
		}
		if (lineZs.length) {
			lv = getWasmBatchHitViewsOutLineZ(lineZs.length)
			for (let i = 0; i < lineZs.length; i++) { const h = lineZs[i]! as unknown as { xy: { x: number; y: number }; hitBBox: FRect3D }; lv.lx[i] = h.xy.x; lv.ly[i] = h.xy.y; lv.zl[i] = h.hitBBox.zlow; lv.zh[i] = h.hitBBox.zhigh }
			lv.run(ball.state.pos.x, ball.state.pos.y, ball.state.pos.z, ball.hit.vel.x, ball.hit.vel.y, ball.hit.vel.z, ball.data.radius, coll.hitTime)
		}
		for (let oi = 0; oi < this._orderLen; oi++) {
			const e = this._order[oi]!
			if (e.kind === 'other') { (e.obj as HitObject).doHitTest(ball, coll, physics); continue }
			let t = -1, contact = 0, nx = 0, ny = 0, nz = 0, dist = 0, bnv = 0
			if (e.kind === 'circle') { t = cv!.oT[e.idx]!; contact = cv!.oContact[e.idx]!; nx = cv!.oNx[e.idx]!; ny = cv!.oNy[e.idx]!; nz = cv!.oNz[e.idx]!; dist = cv!.oDist[e.idx]!; bnv = cv!.oBnv[e.idx]! }
			else if (e.kind === 'plane') { t = pv!.oT[e.idx]!; contact = pv!.oContact[e.idx]!; nx = pv!.oNx[e.idx]!; ny = pv!.oNy[e.idx]!; nz = pv!.oNz[e.idx]!; dist = pv!.oDist[e.idx]!; bnv = pv!.oBnv[e.idx]! }
			else { t = lv!.oT[e.idx]!; contact = lv!.oContact[e.idx]!; nx = lv!.oNx[e.idx]!; ny = lv!.oNy[e.idx]!; nz = lv!.oNz[e.idx]!; dist = lv!.oDist[e.idx]!; bnv = lv!.oBnv[e.idx]! }
			const obj = e.obj as HitObject, isContact = !!contact, valid = t >= -0.5 && t <= coll.hitTime
			if (!isContact && !valid) continue
			if (!physics.recordContacts) {
				if (!valid) continue
				coll.hitNormal.x = nx; coll.hitNormal.y = ny; coll.hitNormal.z = nz
				coll.hitDistance = dist; coll.isContact = isContact
				if (isContact) coll.hitOrgNormalVelocity = bnv
				coll.ball = ball; coll.obj = obj; coll.hitTime = t
			} else {
				const nc = CollisionEvent.claim(ball)
				nc.hitNormal.x = nx; nc.hitNormal.y = ny; nc.hitNormal.z = nz
				nc.hitDistance = dist; nc.isContact = isContact; nc.hitOrgNormalVelocity = bnv
				if (isContact || valid) {
					nc.ball = ball; nc.obj = obj
					if (isContact) physics.contacts.push(nc)
					else { coll.set(nc); coll.hitTime = t; CollisionEvent.releaseOne(nc) }
				} else CollisionEvent.releaseOne(nc)
			}
		}
	}

	private hitTestBallScalar(ball: Ball, coll: CollisionEvent, physics: PlayerPhysics): void {
		const bBox = ball.hit.hitBBox, pos = ball.state.pos, radSq = ball.hit.rcHitRadiusSqr
		for (let i = 0; i < this.vho.length; i++) { const h = this.vho[i]!; if (ball.hit !== h && h.hitBBox.intersectRect(bBox) && h.hitBBox.intersectSphere(pos, radSq)) h.doHitTest(ball, coll, physics) }
		if (this.isLeaf) return
		const vcX = this.vCenter.x, vcY = this.vCenter.y, isLeft = bBox.left <= vcX, isRight = bBox.right >= vcX
		if (bBox.top <= vcY) { if (isLeft) this.children[0]?.hitTestBall(ball, coll, physics); if (isRight) this.children[1]?.hitTestBall(ball, coll, physics) }
		if (bBox.bottom >= vcY) { if (isLeft) this.children[2]?.hitTestBall(ball, coll, physics); if (isRight) this.children[3]?.hitTestBall(ball, coll, physics) }
	}

	private pushOrder(obj: HitObject, kind: 'circle' | 'plane' | 'lineZ' | 'other', idx: number): void {
		const o = this._order, n = this._orderLen
		let e = o[n]
		if (e) { e.obj = obj; e.kind = kind; e.idx = idx } else { e = { obj, kind, idx }; o.push(e) }
		this._orderLen++
	}

	private collect(ball: Ball): number {
		const circles = this._circles; circles.length = 0
		const planes = this._planes; planes.length = 0
		const lineZs = this._lineZs; lineZs.length = 0
		this._orderLen = 0
		this.collectTraverse(this, ball)
		return this._orderLen
	}

	private collectTraverse(node: HitQuadtree, ball: Ball): void {
		const circles = this._circles, planes = this._planes, lineZs = this._lineZs
		const vho = node.vho
		for (let i = 0; i < vho.length; i++) {
			const h = vho[i]!
			if (ball.hit === h) continue
			if (h.obj?.abortHitTest?.()) continue
			if (!h.isEnabled) continue
			if (!h.hitBBox.intersectRect(ball.hit.hitBBox)) continue
			if (!h.hitBBox.intersectSphere(ball.state.pos, ball.hit.rcHitRadiusSqr)) continue
			if (h instanceof HitCircle && (h as unknown as { objType: CollisionType }).objType !== CollisionType.Kicker && (h as unknown as { objType: CollisionType }).objType !== CollisionType.Trigger && h.constructor === HitCircle) { this.pushOrder(h, 'circle', circles.length); circles.push(h as HitCircle) }
			else if (h instanceof HitPlane) { this.pushOrder(h, 'plane', planes.length); planes.push(h as HitPlane) }
			else if (h instanceof HitLineZ && !(h instanceof HitLine3D)) { this.pushOrder(h, 'lineZ', lineZs.length); lineZs.push(h as HitLineZ) }
			else this.pushOrder(h, 'other', -1)
		}
		if (node.isLeaf) return
		const bBox = ball.hit.hitBBox, vcX = node.vCenter.x, vcY = node.vCenter.y, isLeft = bBox.left <= vcX, isRight = bBox.right >= vcX
		if (bBox.top <= vcY) { if (isLeft && node.children[0]) this.collectTraverse(node.children[0], ball); if (isRight && node.children[1]) this.collectTraverse(node.children[1], ball) }
		if (bBox.bottom >= vcY) { if (isLeft && node.children[2]) this.collectTraverse(node.children[2], ball); if (isRight && node.children[3]) this.collectTraverse(node.children[3], ball) }
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
