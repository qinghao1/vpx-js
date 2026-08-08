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
import { isWasmReady, tryGetWasmBatchHitViewsOutCircle, tryGetWasmBatchHitViewsOutLineZ, tryGetWasmBatchHitViewsOutPlane, warmWasmPools } from './wasm/kernels.js'
import type { CircleViews, LineViews, PlaneViews } from './wasm/kernels.js'
import type { HitObject } from './hit-object.js'

type Kind = 'circle' | 'plane' | 'lineZ' | 'other'
type Order = { obj: HitObject; kind: Kind; idx: number }

const COUNT_MASK = 0x3fffffff
const AXIS_SHIFT = 30

/** KD-tree — batched WASM SoA. @see https://github.com/vpinball/vpinball/blob/master/hitoctree.cpp */
export class HitKDNode {
	public rectBounds = new FRect3D()
	public start = 0
	public items = 0
	private children: HitKDNode[] = []

	private _circles: HitCircle[] = []
	private _planes: HitPlane[] = []
	private _lineZs: HitLineZ[] = []
	private _order: Order[] = []
	private _orderLen = 0

	constructor(private hitOct: HitKD) {}
	public reset(o: HitKD): void { this.children.length = 0; this.hitOct = o; this.start = 0; this.items = 0 }

	public hitTestBall(ball: Ball, coll: CollisionEvent, physics: PlayerPhysics): void {
		if (!isWasmReady() || !this.collect(ball)) return this.hitTestBallScalar(ball, coll, physics)

		const { _circles: circles, _planes: planes, _lineZs: lineZs } = this
		let cv = circles.length ? tryGetWasmBatchHitViewsOutCircle(circles.length) : null
		let pv = planes.length ? tryGetWasmBatchHitViewsOutPlane(planes.length) : null
		let lv = lineZs.length ? tryGetWasmBatchHitViewsOutLineZ(lineZs.length) : null
		if ((circles.length && !cv) || (planes.length && !pv) || (lineZs.length && !lv)) {
			queueMicrotask(() => warmWasmPools(circles.length, planes.length, lineZs.length))
			return this.hitTestBallScalar(ball, coll, physics)
		}

		if (cv) this.fillCircles(cv, circles)
		if (pv) this.fillPlanes(pv, planes)
		if (lv) this.fillLineZs(lv, lineZs)

		const pos = ball.state.pos, vel = ball.hit.vel, r = ball.data.radius, dt = coll.hitTime
		if (cv) cv.run(pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, r, dt)
		if (pv) pv.run(pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, r, dt)
		if (lv) lv.run(pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, r, dt)

		this.replay(ball, coll, physics, cv, pv, lv)
	}

	private fillCircles(cv: CircleViews, circles: HitCircle[]): void {
		for (let i = 0; i < circles.length; i++) {
			const h = circles[i]!
			cv.cx[i] = h.center.x
			cv.cy[i] = h.center.y
			cv.cr[i] = h.radius
			cv.zl[i] = h.hitBBox.zlow
			cv.zh[i] = h.hitBBox.zhigh
		}
	}

	private fillPlanes(pv: PlaneViews, planes: HitPlane[]): void {
		for (let i = 0; i < planes.length; i++) {
			const h = planes[i]!
			pv.nx[i] = h.normal.x
			pv.ny[i] = h.normal.y
			pv.nz[i] = h.normal.z
			pv.d[i] = h.d
		}
	}

	private fillLineZs(lv: LineViews, lineZs: HitLineZ[]): void {
		for (let i = 0; i < lineZs.length; i++) {
			const h = lineZs[i]!
			lv.lx[i] = h.xy.x
			lv.ly[i] = h.xy.y
			lv.zl[i] = h.hitBBox.zlow
			lv.zh[i] = h.hitBBox.zhigh
		}
	}

	private replay(ball: Ball, coll: CollisionEvent, physics: PlayerPhysics, cv: CircleViews | null, pv: PlaneViews | null, lv: LineViews | null): void {
		for (let i = 0; i < this._orderLen; i++) {
			const e = this._order[i]!
			if (e.kind === 'other') { e.obj.doHitTest(ball, coll, physics); continue }
			const s = e.kind === 'circle' ? cv! : e.kind === 'plane' ? pv! : lv!
			const t = s.oT[e.idx]!
			const contact = s.oContact[e.idx]!
			const nx = s.oNx[e.idx]!, ny = s.oNy[e.idx]!, nz = s.oNz[e.idx]!
			const dist = s.oDist[e.idx]!, bnv = s.oBnv[e.idx]!
			const isContact = !!contact
			const valid = t >= -0.5 && t <= coll.hitTime
			if (!isContact && !valid) continue
			if (!physics.recordContacts) {
				if (!valid) continue
				coll.hitNormal.x = nx; coll.hitNormal.y = ny; coll.hitNormal.z = nz
				coll.hitDistance = dist; coll.isContact = isContact
				if (isContact) coll.hitOrgNormalVelocity = bnv
				coll.ball = ball; coll.obj = e.obj; coll.hitTime = t
			} else {
				const nc = CollisionEvent.claim(ball)
				nc.hitNormal.x = nx; nc.hitNormal.y = ny; nc.hitNormal.z = nz
				nc.hitDistance = dist; nc.isContact = isContact; nc.hitOrgNormalVelocity = bnv
				if (isContact || valid) {
					nc.ball = ball; nc.obj = e.obj
					if (isContact) physics.contacts.push(nc)
					else { coll.set(nc); coll.hitTime = t; CollisionEvent.releaseOne(nc) }
				} else CollisionEvent.releaseOne(nc)
			}
		}
	}

	private hitTestBallScalar(ball: Ball, coll: CollisionEvent, physics: PlayerPhysics): void {
		const count = this.items & COUNT_MASK
		for (let i = this.start; i < this.start + count; i++) { const h = this.hitOct.getItemAt(i); if (h !== ball.hit) h.doHitTest(ball, coll, physics) }
		if (this.children.length === 0) return
		const axis = this.items >> AXIS_SHIFT
		const bounds = this.rectBounds
		const box = ball.hit.hitBBox
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

	private pushOrder(o: HitObject, k: Kind, idx: number): void {
		const a = this._order, n = this._orderLen
		const e = a[n]
		if (e) { e.obj = o; e.kind = k; e.idx = idx } else a.push({ obj: o, kind: k, idx })
		this._orderLen++
	}

	private collect(ball: Ball): number {
		this._circles.length = 0; this._planes.length = 0; this._lineZs.length = 0; this._orderLen = 0
		this.traverse(this, ball)
		return this._orderLen
	}

	private traverse(node: HitKDNode, ball: Ball): void {
		const r = node.rectBounds, b = ball.hit.hitBBox, pos = ball.state.pos, rs = ball.hit.rcHitRadiusSqr
		if (!r.intersectRect(b) || !r.intersectSphere(pos, rs)) return
		const count = node.items & COUNT_MASK
		for (let i = node.start; i < node.start + count; i++) {
			const h = node.hitOct.getItemAt(i)
			if (h === ball.hit || h.obj?.abortHitTest?.() || !h.isEnabled) continue
			if (!h.hitBBox.intersectRect(b) || !h.hitBBox.intersectSphere(pos, rs)) continue
			if (h instanceof HitCircle && h.constructor === HitCircle && (h as unknown as { objType: CollisionType }).objType !== CollisionType.Kicker && (h as unknown as { objType: CollisionType }).objType !== CollisionType.Trigger) {
				this.pushOrder(h, 'circle', this._circles.length); this._circles.push(h as HitCircle)
			} else if (h instanceof HitPlane) { this.pushOrder(h, 'plane', this._planes.length); this._planes.push(h as HitPlane) }
			else if (h instanceof HitLineZ && !(h instanceof HitLine3D)) { this.pushOrder(h, 'lineZ', this._lineZs.length); this._lineZs.push(h as HitLineZ) }
			else this.pushOrder(h, 'other', -1)
		}
		if (node.children.length === 0) return
		const axis = node.items >> AXIS_SHIFT
		if (axis === 0) { const cc = (r.left + r.right) * 0.5; if (b.left <= cc) this.traverse(node.children[0]!, ball); if (b.right >= cc) this.traverse(node.children[1]!, ball) }
		else if (axis === 1) { const cc = (r.top + r.bottom) * 0.5; if (b.top <= cc) this.traverse(node.children[0]!, ball); if (b.bottom >= cc) this.traverse(node.children[1]!, ball) }
		else { const cc = (r.zlow + r.zhigh) * 0.5; if (b.zlow <= cc) this.traverse(node.children[0]!, ball); if (b.zhigh >= cc) this.traverse(node.children[1]!, ball) }
	}

	public createNextLevel(level: number, levelEmpty: number): void {
		const org = this.items & COUNT_MASK
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
		if (axis === 0) { for (let i = this.start; i < this.start + org; i++) { const idx = this.hitOct.orgIdx[i]!; const h = this.hitOct.getItemAt(i).hitBBox; if (h.right < vc.x) this.hitOct.tmp[this.children[0].start + this.children[0].items++] = idx; else if (h.left > vc.x) this.hitOct.tmp[this.children[1].start + this.children[1].items++] = idx; else this.hitOct.orgIdx[this.start + middle++] = idx } }
		else if (axis === 1) { for (let i = this.start; i < this.start + org; i++) { const idx = this.hitOct.orgIdx[i]!; const h = this.hitOct.getItemAt(i).hitBBox; if (h.bottom < vc.y) this.hitOct.tmp[this.children[0].start + this.children[0].items++] = idx; else if (h.top > vc.y) this.hitOct.tmp[this.children[1].start + this.children[1].items++] = idx; else this.hitOct.orgIdx[this.start + middle++] = idx } }
		else { for (let i = this.start; i < this.start + org; i++) { const idx = this.hitOct.orgIdx[i]!; const h = this.hitOct.getItemAt(i).hitBBox; if (h.zhigh < vc.z) this.hitOct.tmp[this.children[0].start + this.children[0].items++] = idx; else if (h.zlow > vc.z) this.hitOct.tmp[this.children[1].start + this.children[1].items++] = idx; else this.hitOct.orgIdx[this.start + middle++] = idx } }
		this.items = middle | (axis << AXIS_SHIFT)
		if (this.children[0].items > 0) for (let i = 0; i < this.children[0].items; i++) this.hitOct.orgIdx[this.children[0].start + i] = this.hitOct.tmp[this.children[0].start + i]!
		if (this.children[1].items > 0) for (let i = 0; i < this.children[1].items; i++) this.hitOct.orgIdx[this.children[1].start + i] = this.hitOct.tmp[this.children[1].start + i]!
		Vertex3D.release(vc)
		this.children[0].createNextLevel(level + 1, levelEmptyLocal)
		this.children[1].createNextLevel(level + 1, levelEmptyLocal)
	}
}
