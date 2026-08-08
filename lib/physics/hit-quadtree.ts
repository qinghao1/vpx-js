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
import { getWasmKernels, getWasmBatchHitViewsOutCircle, isWasmReady, tryGetWasmBatchHitViewsOutCircle, tryGetWasmBatchHitViewsOutLineZ, tryGetWasmBatchHitViewsOutPlane, warmWasmPools } from './wasm/kernels.js'
import type { CircleViews, LineViews, PlaneViews } from './wasm/kernels.js'

type Kind = 'circle' | 'plane' | 'lineZ' | 'other'
type Order = { obj: HitObject; kind: Kind; idx: number }

/** Quad-tree broadphase — batched WASM SoA. @see https://github.com/vpinball/vpinball/blob/master/quadtree.cpp */
export class HitQuadtree {
	private unique?: EventProxy
	private vho: HitObject[] = []
	private children: HitQuadtree[] = []
	private vCenter = new Vertex3D()
	private isLeaf = true

	private _circles: HitCircle[] = []
	private _planes: HitPlane[] = []
	private _lineZs: HitLineZ[] = []
	private _order: Order[] = []
	private _orderLen = 0

	public addElement(o: HitObject): void { this.vho.push(o) }

	public initialize(b?: FRect3D): void {
		if (!b) { b = new FRect3D(); for (const h of this.vho) b.extend(h.hitBBox) }
		// Warm SoA pools outside hot loop — direct alias to wasm memory, zero copy,
		// no _malloc on hitTestBall. Count before split so cap >= max collect.
		const warm = () => {
			let c = 0, p = 0, l = 0
			for (const h of this.vho) {
				if (h instanceof HitCircle) c++
				else if (h instanceof HitPlane) p++
				else if (h instanceof HitLineZ && !(h instanceof HitLine3D)) l++
			}
			if (c || p || l) warmWasmPools(c, p, l)
		}
		if (isWasmReady()) warm()
		else void getWasmKernels().then(warm)
		this.createNextLevel(b, 0, 0)
	}

	public hitTestBall(ball: Ball, coll: CollisionEvent, physics: PlayerPhysics): void {
		if (!isWasmReady() || !this.collect(ball)) return this.hitTestBallScalar(ball, coll, physics)

		const { _circles: circles, _planes: planes, _lineZs: lineZs } = this
		let cv = circles.length ? tryGetWasmBatchHitViewsOutCircle(circles.length) : null
		let pv = planes.length ? tryGetWasmBatchHitViewsOutPlane(planes.length) : null
		let lv = lineZs.length ? tryGetWasmBatchHitViewsOutLineZ(lineZs.length) : null
		if ((circles.length && !cv) || (planes.length && !pv) || (lineZs.length && !lv)) {
			// No _malloc on hot path — fall back to scalar and warm for next tick
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
		const bBox = ball.hit.hitBBox, pos = ball.state.pos, rs = ball.hit.rcHitRadiusSqr
		for (let i = 0; i < this.vho.length; i++) { const h = this.vho[i]!; if (h !== ball.hit && h.hitBBox.intersectRect(bBox) && h.hitBBox.intersectSphere(pos, rs)) h.doHitTest(ball, coll, physics) }
		if (this.isLeaf) return
		const { x, y } = this.vCenter, left = bBox.left <= x, right = bBox.right >= x
		if (bBox.top <= y) { if (left) this.children[0]?.hitTestBall(ball, coll, physics); if (right) this.children[1]?.hitTestBall(ball, coll, physics) }
		if (bBox.bottom >= y) { if (left) this.children[2]?.hitTestBall(ball, coll, physics); if (right) this.children[3]?.hitTestBall(ball, coll, physics) }
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

	private traverse(node: HitQuadtree, ball: Ball): void {
		const { _circles: c, _planes: p, _lineZs: l } = this
		for (let i = 0; i < node.vho.length; i++) {
			const h = node.vho[i]!
			if (h === ball.hit || h.obj?.abortHitTest?.() || !h.isEnabled) continue
			if (!h.hitBBox.intersectRect(ball.hit.hitBBox) || !h.hitBBox.intersectSphere(ball.state.pos, ball.hit.rcHitRadiusSqr)) continue
			if (h instanceof HitCircle && h.constructor === HitCircle && (h as unknown as { objType: CollisionType }).objType !== CollisionType.Kicker && (h as unknown as { objType: CollisionType }).objType !== CollisionType.Trigger) {
				this.pushOrder(h, 'circle', c.length); c.push(h as HitCircle)
			} else if (h instanceof HitPlane) { this.pushOrder(h, 'plane', p.length); p.push(h as HitPlane) }
			else if (h instanceof HitLineZ && !(h instanceof HitLine3D)) { this.pushOrder(h, 'lineZ', l.length); l.push(h as HitLineZ) }
			else this.pushOrder(h, 'other', -1)
		}
		if (node.isLeaf) return
		const b = ball.hit.hitBBox, { x, y } = node.vCenter, left = b.left <= x, right = b.right >= x
		if (b.top <= y) { if (left && node.children[0]) this.traverse(node.children[0], ball); if (right && node.children[1]) this.traverse(node.children[1], ball) }
		if (b.bottom >= y) { if (left && node.children[2]) this.traverse(node.children[2], ball); if (right && node.children[3]) this.traverse(node.children[3], ball) }
	}

	private createNextLevel(bounds: FRect3D, level: number, levelEmpty: number): void {
		if (this.vho.length <= 4) return
		this.isLeaf = false
		this.vCenter.x = (bounds.left + bounds.right) * 0.5
		this.vCenter.y = (bounds.top + bounds.bottom) * 0.5
		this.vCenter.z = (bounds.zlow + bounds.zhigh) * 0.5
		for (let i = 0; i < 4; i++) this.children[i] = new HitQuadtree()
		const remain: HitObject[] = []
		this.unique = this.vho[0]!.isPrimitive ? this.vho[0]!.eventProxy : undefined
		for (const o of this.vho) {
			if ((o.isPrimitive ? o.eventProxy : undefined) !== this.unique) this.unique = undefined
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
		if (empty >= 4) levelEmpty++; else levelEmpty = 0
		if (this.vCenter.x - bounds.left > 0.0001 && levelEmpty <= 8 && level + 1 < 128 / 3) {
			for (let i = 0; i < 4; i++) {
				const b = new FRect3D()
				b.left = i & 1 ? this.vCenter.x : bounds.left; b.top = i & 2 ? this.vCenter.y : bounds.top; b.zlow = bounds.zlow
				b.right = i & 1 ? bounds.right : this.vCenter.x; b.bottom = i & 2 ? bounds.bottom : this.vCenter.y; b.zhigh = bounds.zhigh
				this.children[i]!.createNextLevel(b, level + 1, levelEmpty)
			}
		}
	}
}
