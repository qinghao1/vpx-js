// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { PlayerPhysics } from '../game/player-physics.js'
import { FRect3D } from '../util/frect3d.js'
import { Vertex3D } from '../util/math.js'
import type { Ball } from '../vpt/ball/ball.js'
import { CollisionEvent } from './collision-event.js'
import type { HitKD } from './hit-kd.js'
import { CollisionType } from './collision-type.js'
import { HitCircle } from './hit-circle.js'
import { HitPlane } from './hit-plane.js'
import { HitLineZ } from './hit-line-z.js'
import { HitLine3D } from './hit-line-3d.js'
import { getWasmBatchHitViewsOutCircle, getWasmBatchHitViewsOutPlane, getWasmBatchHitViewsOutLineZ, isWasmReady } from './wasm/kernels.js'
import type { HitObject } from './hit-object.js'

/** KD-tree node. @see https://github.com/vpinball/vpinball/blob/master/hitoctree.cpp */
export class HitKDNode {
	public rectBounds = new FRect3D()
	public start = 0
	public items = 0
	private children: HitKDNode[] = []
	private _circles: HitCircle[] = []
	private _planes: HitPlane[] = []
	private _lineZs: HitLineZ[] = []
	private _order: Array<{ obj: HitObject; kind: 'circle' | 'plane' | 'lineZ' | 'other'; idx: number }> = []
	private _orderLen = 0

	constructor(private hitOct: HitKD) {}

	public reset(hitOct: HitKD): void { this.children.length = 0; this.hitOct = hitOct; this.start = 0; this.items = 0 }

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
		const n = this.items & 0x3fffffff, axis = this.items >> 30
		for (let i = this.start; i < this.start + n; i++) { const o = this.hitOct.getItemAt(i); if (ball.hit !== o && o.hitBBox.intersectSphere(ball.state.pos, ball.hit.rcHitRadiusSqr)) o.doHitTest(ball, coll, physics) }
		if (!this.children.length) return
		const r = this.rectBounds, b = ball.hit.hitBBox
		if (axis === 0) { const c = (r.left + r.right) * 0.5; if (b.left <= c) this.children[0]!.hitTestBall(ball, coll, physics); if (b.right >= c) this.children[1]!.hitTestBall(ball, coll, physics) }
		else if (axis === 1) { const c = (r.top + r.bottom) * 0.5; if (b.top <= c) this.children[0]!.hitTestBall(ball, coll, physics); if (b.bottom >= c) this.children[1]!.hitTestBall(ball, coll, physics) }
		else { const c = (r.zlow + r.zhigh) * 0.5; if (b.zlow <= c) this.children[0]!.hitTestBall(ball, coll, physics); if (b.zhigh >= c) this.children[1]!.hitTestBall(ball, coll, physics) }
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

	private collectTraverse(node: HitKDNode, ball: Ball): void {
		const circles = this._circles, planes = this._planes, lineZs = this._lineZs
		const n = node.items & 0x3fffffff
		for (let i = node.start; i < node.start + n; i++) {
			const h = node.hitOct.getItemAt(i)
			if (ball.hit === h) continue
			if (h.obj?.abortHitTest?.()) continue
			if (!h.isEnabled) continue
			if (!h.hitBBox.intersectSphere(ball.state.pos, ball.hit.rcHitRadiusSqr)) continue
			if (h instanceof HitCircle && (h as unknown as { objType: CollisionType }).objType !== CollisionType.Kicker && (h as unknown as { objType: CollisionType }).objType !== CollisionType.Trigger && h.constructor === HitCircle) { this.pushOrder(h, 'circle', circles.length); circles.push(h as HitCircle) }
			else if (h instanceof HitPlane) { this.pushOrder(h, 'plane', planes.length); planes.push(h as HitPlane) }
			else if (h instanceof HitLineZ && !(h instanceof HitLine3D)) { this.pushOrder(h, 'lineZ', lineZs.length); lineZs.push(h as HitLineZ) }
			else this.pushOrder(h, 'other', -1)
		}
		if (!node.children.length) return
		const r = node.rectBounds, b = ball.hit.hitBBox, axis = node.items >> 30
		if (axis === 0) { const c = (r.left + r.right) * 0.5; if (b.left <= c) this.collectTraverse(node.children[0]!, ball); if (b.right >= c) this.collectTraverse(node.children[1]!, ball) }
		else if (axis === 1) { const c = (r.top + r.bottom) * 0.5; if (b.top <= c) this.collectTraverse(node.children[0]!, ball); if (b.bottom >= c) this.collectTraverse(node.children[1]!, ball) }
		else { const c = (r.zlow + r.zhigh) * 0.5; if (b.zlow <= c) this.collectTraverse(node.children[0]!, ball); if (b.zhigh >= c) this.collectTraverse(node.children[1]!, ball) }
	}

	public createNextLevel(level: number, levelEmpty: number): void {
		const org = this.items & 0x3fffffff
		if (org <= 4 || level >= 64) return
		const d = Vertex3D.claim(this.rectBounds.right - this.rectBounds.left, this.rectBounds.bottom - this.rectBounds.top, this.rectBounds.zhigh - this.rectBounds.zlow)
		let axis: number
		if (d.x > d.y && d.x > d.z) { if (d.x < 1e-4) { Vertex3D.release(d); return } axis = 0 }
		else if (d.y > d.z) { if (d.y < 1e-4) { Vertex3D.release(d); return } axis = 1 }
		else { if (d.z < 1e-4) { Vertex3D.release(d); return } axis = 2 }
		Vertex3D.release(d)
		this.children = this.hitOct.allocTwoNodes()
		if (!this.children.length) return
		this.children[0].rectBounds = new FRect3D(this.rectBounds.left, this.rectBounds.right, this.rectBounds.top, this.rectBounds.bottom, this.rectBounds.zlow, this.rectBounds.zhigh)
		this.children[1].rectBounds = new FRect3D(this.rectBounds.left, this.rectBounds.right, this.rectBounds.top, this.rectBounds.bottom, this.rectBounds.zlow, this.rectBounds.zhigh)
		const vc = Vertex3D.claim((this.rectBounds.left + this.rectBounds.right) * 0.5, (this.rectBounds.top + this.rectBounds.bottom) * 0.5, (this.rectBounds.zlow + this.rectBounds.zhigh) * 0.5)
		if (axis === 0) { this.children[0].rectBounds.right = vc.x; this.children[1].rectBounds.left = vc.x }
		else if (axis === 1) { this.children[0].rectBounds.bottom = vc.y; this.children[1].rectBounds.top = vc.y }
		else { this.children[0].rectBounds.zhigh = vc.z; this.children[1].rectBounds.zlow = vc.z }
		for (const ch of this.children) { ch.hitOct = this.hitOct; ch.items = 0; ch.children.length = 0 }
		if (axis === 0) { for (let i = this.start; i < this.start + org; i++) { const h = this.hitOct.getItemAt(i).hitBBox; if (h.right < vc.x) this.children[0].items++; else if (h.left > vc.x) this.children[1].items++ } }
		else if (axis === 1) { for (let i = this.start; i < this.start + org; i++) { const h = this.hitOct.getItemAt(i).hitBBox; if (h.bottom < vc.y) this.children[0].items++; else if (h.top > vc.y) this.children[1].items++ } }
		else { for (let i = this.start; i < this.start + org; i++) { const h = this.hitOct.getItemAt(i).hitBBox; if (h.zhigh < vc.z) this.children[0].items++; else if (h.zlow > vc.z) this.children[1].items++ } }
		const leftCount = this.children[0].items, rightCount = this.children[1].items
		let levelEmptyLocal = levelEmpty, middleCount = org - leftCount - rightCount, countEmpty = 0
		if (leftCount === 0) countEmpty++; if (rightCount === 0) countEmpty++; if (middleCount === 0) countEmpty++
		if (countEmpty >= 2) levelEmptyLocal++; else levelEmptyLocal = 0
		if (levelEmptyLocal > 8) { this.hitOct.numNodes -= 2; this.children.length = 0; Vertex3D.release(vc); return }
		this.children[0].start = this.start + middleCount; this.children[1].start = this.children[0].start + leftCount
		let middle = 0; this.children[0].items = 0; this.children[1].items = 0
		if (axis === 0) { for (let i = this.start; i < this.start + org; i++) { const idx = this.hitOct.orgIdx[i]; const h = this.hitOct.getItemAt(i).hitBBox; if (h.right < vc.x) this.hitOct.tmp[this.children[0].start + this.children[0].items++] = idx; else if (h.left > vc.x) this.hitOct.tmp[this.children[1].start + this.children[1].items++] = idx; else this.hitOct.orgIdx[this.start + middle++] = idx } }
		else if (axis === 1) { for (let i = this.start; i < this.start + org; i++) { const idx = this.hitOct.orgIdx[i]; const h = this.hitOct.getItemAt(i).hitBBox; if (h.bottom < vc.y) this.hitOct.tmp[this.children[0].start + this.children[0].items++] = idx; else if (h.top > vc.y) this.hitOct.tmp[this.children[1].start + this.children[1].items++] = idx; else this.hitOct.orgIdx[this.start + middle++] = idx } }
		else { for (let i = this.start; i < this.start + org; i++) { const idx = this.hitOct.orgIdx[i]; const h = this.hitOct.getItemAt(i).hitBBox; if (h.zhigh < vc.z) this.hitOct.tmp[this.children[0].start + this.children[0].items++] = idx; else if (h.zlow > vc.z) this.hitOct.tmp[this.children[1].start + this.children[1].items++] = idx; else this.hitOct.orgIdx[this.start + middle++] = idx } }
		this.items = middle | (axis << 30)
		if (this.children[0].items > 0) for (let i = 0; i < this.children[0].items; i++) this.hitOct.orgIdx[this.children[0].start + i] = this.hitOct.tmp[this.children[0].start + i]
		if (this.children[1].items > 0) for (let i = 0; i < this.children[1].items; i++) this.hitOct.orgIdx[this.children[1].start + i] = this.hitOct.tmp[this.children[1].start + i]
		Vertex3D.release(vc)
		this.children[0].createNextLevel(level + 1, levelEmptyLocal)
		this.children[1].createNextLevel(level + 1, levelEmptyLocal)
	}
}
