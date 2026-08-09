// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { EventProxy } from '../game/event-proxy.js'
import type { PlayerPhysics } from '../game/player-physics.js'
import { FRect3D } from '../util/frect3d.js'
import { Vertex3D } from '../util/math.js'
import type { Ball } from '../vpt/ball/ball.js'
import { CollisionEvent } from './collision-event.js'
import type { HitObject } from './hit-object.js'
import { HitCircle } from './hit-circle.js'
import { HitPlane } from './hit-plane.js'
import { HitLineZ } from './hit-line-z.js'
import { HitLine3D } from './hit-line-3d.js'
import { HitPoint } from './hit-point.js'
import { HitTriangle } from './hit-triangle.js'
import { LineSeg } from './line-seg.js'
import { getWasmKernels, isWasmReady, tryGetWasmBatchHitViewsOutCircle, tryGetWasmBatchHitViewsOutLine3D, tryGetWasmBatchHitViewsOutLineSeg, tryGetWasmBatchHitViewsOutLineZ, tryGetWasmBatchHitViewsOutPlane, tryGetWasmBatchHitViewsOutPoint, tryGetWasmBatchHitViewsOutTriangle, warmWasmPools } from './wasm/kernels.js'
import type { CircleViews, Line3DViews, LineSegViews, LineViews, PlaneViews, PointViews, TriangleViews } from './wasm/kernels.js'

type Kind = 'circle' | 'plane' | 'lineZ' | 'point' | 'triangle' | 'lineSeg' | 'line3D' | 'other'
type Order = { obj: HitObject; kind: Kind; idx: number }

const isBatchCircle = (h: HitObject): h is HitCircle => h instanceof HitCircle && h.hitTest === HitCircle.prototype.hitTest
const isBatchPoint = (h: HitObject): h is HitPoint => h instanceof HitPoint
const isBatchTriangle = (h: HitObject): h is HitTriangle => h instanceof HitTriangle
const isBatchLineSeg = (h: HitObject): h is LineSeg => h instanceof LineSeg && h.hitTest === LineSeg.prototype.hitTest
const isBatchLine3D = (h: HitObject): h is HitLine3D => h instanceof HitLine3D

/** @see https://github.com/vpinball/vpinball/blob/master/quadtree.cpp */
export class HitQuadtree {
	private unique?: EventProxy
	private vho: HitObject[] = []
	private children: HitQuadtree[] = []
	private vCenter = new Vertex3D()
	private isLeaf = true

	private _circles: HitCircle[] = []
	private _planes: HitPlane[] = []
	private _lineZs: HitLineZ[] = []
	private _points: HitPoint[] = []
	private _triangles: HitTriangle[] = []
	private _lineSegs: LineSeg[] = []
	private _line3Ds: HitLine3D[] = []
	private _order: Order[] = []
	private _orderLen = 0

	public addElement(o: HitObject): void { this.vho.push(o) }

	public initialize(b?: FRect3D): void {
		if (!b) { b = new FRect3D(); for (const h of this.vho) b.extend(h.hitBBox) }
		const warm = () => {
			let circleCount = 0, planeCount = 0, lineZCount = 0, pointCount = 0, triangleCount = 0, lineSegCount = 0, line3DCount = 0
			for (const h of this.vho) {
				if (isBatchCircle(h)) circleCount++
				else if (h instanceof HitPlane) planeCount++
				else if (h instanceof HitLineZ && !(h instanceof HitLine3D)) lineZCount++
				else if (isBatchPoint(h)) pointCount++
				else if (isBatchTriangle(h)) triangleCount++
				else if (isBatchLineSeg(h)) lineSegCount++
				else if (isBatchLine3D(h)) line3DCount++
			}
			if (circleCount || planeCount || lineZCount || pointCount || triangleCount || lineSegCount || line3DCount) warmWasmPools(circleCount, planeCount, lineZCount, pointCount, triangleCount, lineSegCount, line3DCount)
		}
		if (isWasmReady()) warm()
		else void getWasmKernels().then(warm)
		this.createNextLevel(b, 0, 0)
	}

	public hitTestBall(ball: Ball, coll: CollisionEvent, physics: PlayerPhysics): void {
		if (!isWasmReady() || !this.collect(ball)) return this.hitTestBallScalar(ball, coll, physics)
		const { _circles: circles, _planes: planes, _lineZs: lineZs, _points: points, _triangles: triangles, _lineSegs: lineSegs, _line3Ds: line3Ds } = this
		let circleViews = circles.length ? tryGetWasmBatchHitViewsOutCircle(circles.length) : null
		let planeViews = planes.length ? tryGetWasmBatchHitViewsOutPlane(planes.length) : null
		let lineViews = lineZs.length ? tryGetWasmBatchHitViewsOutLineZ(lineZs.length) : null
		let pointViews = points.length ? tryGetWasmBatchHitViewsOutPoint(points.length) : null
		let triangleViews = triangles.length ? tryGetWasmBatchHitViewsOutTriangle(triangles.length) : null
		let lineSegViews = lineSegs.length ? tryGetWasmBatchHitViewsOutLineSeg(lineSegs.length) : null
		let line3DViews = line3Ds.length ? tryGetWasmBatchHitViewsOutLine3D(line3Ds.length) : null
		if ((circles.length && !circleViews) || (planes.length && !planeViews) || (lineZs.length && !lineViews) || (points.length && !pointViews) || (triangles.length && !triangleViews) || (lineSegs.length && !lineSegViews) || (line3Ds.length && !line3DViews)) {
			queueMicrotask(() => warmWasmPools(circles.length, planes.length, lineZs.length, points.length, triangles.length, lineSegs.length, line3Ds.length))
			return this.hitTestBallScalar(ball, coll, physics)
		}
		if (circleViews) this.fillCircles(circleViews, circles)
		if (planeViews) this.fillPlanes(planeViews, planes)
		if (lineViews) this.fillLineZs(lineViews, lineZs)
		if (pointViews) this.fillPoints(pointViews, points)
		if (triangleViews) this.fillTriangles(triangleViews, triangles)
		if (lineSegViews) this.fillLineSegs(lineSegViews, lineSegs)
		if (line3DViews) this.fillLine3Ds(line3DViews, line3Ds)
		const pos = ball.state.pos, vel = ball.hit.vel, r = ball.data.radius, dt = coll.hitTime
		if (circleViews) circleViews.run(pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, r, dt)
		if (planeViews) planeViews.run(pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, r, dt)
		if (lineViews) lineViews.run(pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, r, dt)
		if (pointViews) pointViews.run(pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, r, dt)
		if (triangleViews) triangleViews.run(pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, r, dt)
		if (lineSegViews) lineSegViews.run(pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, r, dt)
		if (line3DViews) line3DViews.run(pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, r, dt)
		this.replay(ball, coll, physics, circleViews, planeViews, lineViews, pointViews, triangleViews, lineSegViews, line3DViews)
	}

	private fillCircles(circleViews: CircleViews, circles: HitCircle[]): void {
		for (let i = 0; i < circles.length; i++) { const h = circles[i]!; circleViews.cx[i] = h.center.x; circleViews.cy[i] = h.center.y; circleViews.cr[i] = h.radius; circleViews.zl[i] = h.hitBBox.zlow; circleViews.zh[i] = h.hitBBox.zhigh }
	}
	private fillPlanes(planeViews: PlaneViews, planes: HitPlane[]): void {
		for (let i = 0; i < planes.length; i++) { const h = planes[i]!; planeViews.nx[i] = h.normal.x; planeViews.ny[i] = h.normal.y; planeViews.nz[i] = h.normal.z; planeViews.d[i] = h.d }
	}
	private fillLineZs(lineViews: LineViews, lineZs: HitLineZ[]): void {
		for (let i = 0; i < lineZs.length; i++) { const h = lineZs[i]!; lineViews.lx[i] = h.xy.x; lineViews.ly[i] = h.xy.y; lineViews.zl[i] = h.hitBBox.zlow; lineViews.zh[i] = h.hitBBox.zhigh }
	}
	private fillPoints(pointViews: PointViews, points: HitPoint[]): void {
		for (let i = 0; i < points.length; i++) { const h = points[i]! as unknown as { p: { x: number; y: number; z: number } }; pointViews.px[i] = h.p.x; pointViews.py[i] = h.p.y; pointViews.pz[i] = h.p.z }
	}
	private fillTriangles(triangleViews: TriangleViews, triangles: HitTriangle[]): void {
		for (let i = 0; i < triangles.length; i++) { const h = triangles[i]!; const r0 = h.rgv[0]!, r1 = h.rgv[1]!, r2 = h.rgv[2]!; triangleViews.r0x[i] = r0.x; triangleViews.r0y[i] = r0.y; triangleViews.r0z[i] = r0.z; triangleViews.r1x[i] = r1.x; triangleViews.r1y[i] = r1.y; triangleViews.r1z[i] = r1.z; triangleViews.r2x[i] = r2.x; triangleViews.r2y[i] = r2.y; triangleViews.r2z[i] = r2.z; triangleViews.nx[i] = h.normal.x; triangleViews.ny[i] = h.normal.y; triangleViews.nz[i] = h.normal.z }
	}
	private fillLineSegs(lineSegViews: LineSegViews, lineSegs: LineSeg[]): void {
		for (let i = 0; i < lineSegs.length; i++) { const h = lineSegs[i]! as unknown as { v1: { x: number; y: number }; v2: { x: number; y: number }; normal: { x: number; y: number }; length: number; hitBBox: { zlow: number; zhigh: number } }; lineSegViews.v1x[i] = h.v1.x; lineSegViews.v1y[i] = h.v1.y; lineSegViews.v2x[i] = h.v2.x; lineSegViews.v2y[i] = h.v2.y; lineSegViews.nx[i] = h.normal.x; lineSegViews.ny[i] = h.normal.y; lineSegViews.len[i] = h.length; lineSegViews.zl[i] = h.hitBBox.zlow; lineSegViews.zh[i] = h.hitBBox.zhigh }
	}
	private fillLine3Ds(line3DViews: Line3DViews, line3Ds: HitLine3D[]): void {
		for (let i = 0; i < line3Ds.length; i++) { const h = line3Ds[i]! as unknown as { xy: { x: number; y: number }; zLow: number; zHigh: number; matrix: { elements: number[] } }; const m = h.matrix.elements; line3DViews.lx[i] = h.xy.x; line3DViews.ly[i] = h.xy.y; line3DViews.zl[i] = h.zLow; line3DViews.zh[i] = h.zHigh; line3DViews.m00[i] = m[0]!; line3DViews.m01[i] = m[1]!; line3DViews.m02[i] = m[2]!; line3DViews.m10[i] = m[3]!; line3DViews.m11[i] = m[4]!; line3DViews.m12[i] = m[5]!; line3DViews.m20[i] = m[6]!; line3DViews.m21[i] = m[7]!; line3DViews.m22[i] = m[8]! }
	}

	private replay(ball: Ball, coll: CollisionEvent, physics: PlayerPhysics, circleViews: CircleViews | null, planeViews: PlaneViews | null, lineViews: LineViews | null, pointViews: PointViews | null, triangleViews: TriangleViews | null, lineSegViews: LineSegViews | null, line3DViews: Line3DViews | null): void {
		for (let i = 0; i < this._orderLen; i++) {
			const e = this._order[i]!
			if (e.kind === 'other') { e.obj.doHitTest(ball, coll, physics); continue }
			const s = e.kind === 'circle' ? circleViews! : e.kind === 'plane' ? planeViews! : e.kind === 'lineZ' ? lineViews! : e.kind === 'point' ? pointViews! : e.kind === 'triangle' ? triangleViews! : e.kind === 'lineSeg' ? lineSegViews! : line3DViews!
			const t = s.oT[e.idx]!, contact = s.oContact[e.idx]!, nx = s.oNx[e.idx]!, ny = s.oNy[e.idx]!, nz = s.oNz[e.idx]!, dist = s.oDist[e.idx]!, bnv = s.oBnv[e.idx]!
			const isContact = !!contact, valid = t >= -0.5 && t <= coll.hitTime
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
		const b = ball.hit.hitBBox, pos = ball.state.pos, rs = ball.hit.rcHitRadiusSqr
		for (let i = 0; i < this.vho.length; i++) { const h = this.vho[i]!; if (h !== ball.hit && h.hitBBox.intersectRect(b) && h.hitBBox.intersectSphere(pos, rs)) h.doHitTest(ball, coll, physics) }
		if (this.isLeaf) return
		const { x, y } = this.vCenter, left = b.left <= x, right = b.right >= x
		if (b.top <= y) { if (left) this.children[0]?.hitTestBall(ball, coll, physics); if (right) this.children[1]?.hitTestBall(ball, coll, physics) }
		if (b.bottom >= y) { if (left) this.children[2]?.hitTestBall(ball, coll, physics); if (right) this.children[3]?.hitTestBall(ball, coll, physics) }
	}

	private pushOrder(o: HitObject, k: Kind, idx: number): void {
		const a = this._order, n = this._orderLen, e = a[n]
		if (e) { e.obj = o; e.kind = k; e.idx = idx } else a.push({ obj: o, kind: k, idx })
		this._orderLen++
	}

	private collect(ball: Ball): number {
		this._circles.length = 0; this._planes.length = 0; this._lineZs.length = 0; this._points.length = 0; this._triangles.length = 0; this._lineSegs.length = 0; this._line3Ds.length = 0; this._orderLen = 0
		this.traverse(this, ball)
		return this._orderLen
	}

	private traverse(node: HitQuadtree, ball: Ball): void {
		const { _circles: circles, _planes: planes, _lineZs: lineZs, _points: points, _triangles: triangles, _lineSegs: lineSegs, _line3Ds: line3Ds } = this
		for (let i = 0; i < node.vho.length; i++) {
			const h = node.vho[i]!
			if (h === ball.hit || h.obj?.abortHitTest?.() || !h.isEnabled) continue
			if (!h.hitBBox.intersectRect(ball.hit.hitBBox) || !h.hitBBox.intersectSphere(ball.state.pos, ball.hit.rcHitRadiusSqr)) continue
			if (isBatchCircle(h)) { this.pushOrder(h, 'circle', circles.length); circles.push(h) }
			else if (h instanceof HitPlane) { this.pushOrder(h, 'plane', planes.length); planes.push(h as HitPlane) }
			else if (h instanceof HitLineZ && !(h instanceof HitLine3D)) { this.pushOrder(h, 'lineZ', lineZs.length); lineZs.push(h as HitLineZ) }
			else if (isBatchPoint(h)) { this.pushOrder(h, 'point', points.length); points.push(h) }
			else if (isBatchTriangle(h)) { this.pushOrder(h, 'triangle', triangles.length); triangles.push(h) }
			else if (isBatchLine3D(h)) { this.pushOrder(h, 'line3D', line3Ds.length); line3Ds.push(h) }
			else if (isBatchLineSeg(h)) { this.pushOrder(h, 'lineSeg', lineSegs.length); lineSegs.push(h) }
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
