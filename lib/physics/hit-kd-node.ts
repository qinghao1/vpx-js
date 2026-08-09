// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { PlayerPhysics } from '../game/player-physics.js'
import { FRect3D } from '../util/frect3d.js'
import type { Ball } from '../vpt/ball/ball.js'
import { CollisionEvent } from './collision-event.js'
import type { HitKD } from './hit-kd.js'
import { Hit3DPoly } from './hit-3dpoly.js'
import { CollisionType } from './collision-type.js'
import { HitCircle } from './hit-circle.js'
import { HitPlane } from './hit-plane.js'
import { HitLineZ } from './hit-line-z.js'
import { HitLine3D } from './hit-line-3d.js'
import { HitPoint } from './hit-point.js'
import { HitTriangle } from './hit-triangle.js'
import { LineSeg } from './line-seg.js'
import { isWasmReady, tryGetWasmBatchHitViewsOutCircle, tryGetWasmBatchHitViewsOutLine3D, tryGetWasmBatchHitViewsOutLineSeg, tryGetWasmBatchHitViewsOutLineZ, tryGetWasmBatchHitViewsOutPlane, tryGetWasmBatchHitViewsOutPoint, tryGetWasmBatchHitViewsOutPoly, tryGetWasmBatchHitViewsOutTriangle, warmWasmPools } from './wasm/kernels.js'
import { POLY_MAX_VERTS } from './wasm/kernels.js'
import type { CircleViews, Line3DViews, LineSegViews, LineViews, PlaneViews, PointViews, PolyViews, TriangleViews } from './wasm/kernels.js'
import { HitKind, type HitObject } from './hit-object.js'

type Kind = HitKind
type Order = { obj: HitObject; kind: Kind; idx: number }

const COUNT_MASK = 0x3fffffff
const AXIS_SHIFT = 30

const isBatchCircle = (h: HitObject): h is HitCircle => h.hitKind === HitKind.Circle && h.hitTest === HitCircle.prototype.hitTest
const isBatchPoint = (h: HitObject): h is HitPoint => h.hitKind === HitKind.Point
const isBatchTriangle = (h: HitObject): h is HitTriangle => h.hitKind === HitKind.Triangle
const isBatchLineSeg = (h: HitObject): h is LineSeg => h.hitKind === HitKind.LineSeg && h.hitTest === LineSeg.prototype.hitTest
const isBatchLine3D = (h: HitObject): h is HitLine3D => h.hitKind === HitKind.Line3D
const isBatchPoly = (h: HitObject): h is Hit3DPoly => h.hitKind === HitKind.Poly && (h as Hit3DPoly).objType !== CollisionType.Trigger && (h as Hit3DPoly).rgv.length <= 32
const WASM_THRESHOLD = 64

/** @see https://github.com/vpinball/vpinball/blob/master/kdtree.cpp */
export class HitKDNode {
	public rectBounds = new FRect3D()
	public start = 0
	public items = 0
	private children: HitKDNode[] = []

	private _circles: HitCircle[] = []
	private _planes: HitPlane[] = []
	private _lineZs: HitLineZ[] = []
	private _points: HitPoint[] = []
	private _triangles: HitTriangle[] = []
	private _lineSegs: LineSeg[] = []
	private _line3Ds: HitLine3D[] = []
	private _polys: Hit3DPoly[] = []
	private _order: Order[] = []
	private _orderLen = 0

	constructor(private hitOct: HitKD) {}
	public reset(o: HitKD): void { this.children.length = 0; this.hitOct = o; this.start = 0; this.items = 0 }

	public hitTestBall(ball: Ball, coll: CollisionEvent, physics: PlayerPhysics): void {
		if (!isWasmReady()) return this.hitTestBallScalar(ball, coll, physics)
		if (this._orderLen > 0 && this._orderLen < WASM_THRESHOLD) return this.hitTestBallScalar(ball, coll, physics)
		if (!this.collect(ball)) return this.hitTestBallScalar(ball, coll, physics)
		if (this._orderLen < WASM_THRESHOLD) { for (let i = 0; i < this._orderLen; i++) this._order[i]!.obj.doHitTest(ball, coll, physics); return }
		const { _circles: circles, _planes: planes, _lineZs: lineZs, _points: points, _triangles: triangles, _lineSegs: lineSegs, _line3Ds: line3Ds, _polys: polys } = this
		let circleViews = circles.length ? tryGetWasmBatchHitViewsOutCircle(circles.length) : null
		let planeViews = planes.length ? tryGetWasmBatchHitViewsOutPlane(planes.length) : null
		let lineViews = lineZs.length ? tryGetWasmBatchHitViewsOutLineZ(lineZs.length) : null
		let pointViews = points.length ? tryGetWasmBatchHitViewsOutPoint(points.length) : null
		let triangleViews = triangles.length ? tryGetWasmBatchHitViewsOutTriangle(triangles.length) : null
		let lineSegViews = lineSegs.length ? tryGetWasmBatchHitViewsOutLineSeg(lineSegs.length) : null
		let line3DViews = line3Ds.length ? tryGetWasmBatchHitViewsOutLine3D(line3Ds.length) : null
		let polyViews = polys.length ? tryGetWasmBatchHitViewsOutPoly(polys.length) : null
		if ((circles.length && !circleViews) || (planes.length && !planeViews) || (lineZs.length && !lineViews) || (points.length && !pointViews) || (triangles.length && !triangleViews) || (lineSegs.length && !lineSegViews) || (line3Ds.length && !line3DViews) || (polys.length && !polyViews)) {
			queueMicrotask(() => warmWasmPools(circles.length, planes.length, lineZs.length, points.length, triangles.length, lineSegs.length, line3Ds.length, polys.length))
			return this.hitTestBallScalar(ball, coll, physics)
		}
		if (circleViews) this.fillCircles(circleViews, circles)
		if (planeViews) this.fillPlanes(planeViews, planes)
		if (lineViews) this.fillLineZs(lineViews, lineZs)
		if (pointViews) this.fillPoints(pointViews, points)
		if (triangleViews) this.fillTriangles(triangleViews, triangles)
		if (lineSegViews) this.fillLineSegs(lineSegViews, lineSegs)
		if (line3DViews) this.fillLine3Ds(line3DViews, line3Ds)
		if (polyViews) this.fillPolys(polyViews, polys)
		const pos = ball.state.pos, vel = ball.hit.vel, r = ball.data.radius, dt = coll.hitTime
		if (circleViews) circleViews.run(pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, r, dt)
		if (planeViews) planeViews.run(pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, r, dt)
		if (lineViews) lineViews.run(pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, r, dt)
		if (pointViews) pointViews.run(pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, r, dt)
		if (triangleViews) triangleViews.run(pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, r, dt)
		if (lineSegViews) lineSegViews.run(pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, r, dt)
		if (line3DViews) line3DViews.run(pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, r, dt)
		if (polyViews) polyViews.run(pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, r, dt)
		this.replay(ball, coll, physics, circleViews, planeViews, lineViews, pointViews, triangleViews, lineSegViews, line3DViews, polyViews)
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
		for (let i = 0; i < points.length; i++) { const h = points[i]!; pointViews.px[i] = h.p.x; pointViews.py[i] = h.p.y; pointViews.pz[i] = h.p.z }
	}
	private fillTriangles(triangleViews: TriangleViews, triangles: HitTriangle[]): void {
		for (let i = 0; i < triangles.length; i++) { const h = triangles[i]!; const r0 = h.rgv[0]!, r1 = h.rgv[1]!, r2 = h.rgv[2]!; triangleViews.r0x[i] = r0.x; triangleViews.r0y[i] = r0.y; triangleViews.r0z[i] = r0.z; triangleViews.r1x[i] = r1.x; triangleViews.r1y[i] = r1.y; triangleViews.r1z[i] = r1.z; triangleViews.r2x[i] = r2.x; triangleViews.r2y[i] = r2.y; triangleViews.r2z[i] = r2.z; triangleViews.nx[i] = h.normal.x; triangleViews.ny[i] = h.normal.y; triangleViews.nz[i] = h.normal.z }
	}
	private fillLineSegs(lineSegViews: LineSegViews, lineSegs: LineSeg[]): void {
		for (let i = 0; i < lineSegs.length; i++) { const h = lineSegs[i]!; lineSegViews.v1x[i] = h.v1.x; lineSegViews.v1y[i] = h.v1.y; lineSegViews.v2x[i] = h.v2.x; lineSegViews.v2y[i] = h.v2.y; lineSegViews.nx[i] = h.normal.x; lineSegViews.ny[i] = h.normal.y; lineSegViews.len[i] = h.length; lineSegViews.zl[i] = h.hitBBox.zlow; lineSegViews.zh[i] = h.hitBBox.zhigh }
	}
	private fillLine3Ds(line3DViews: Line3DViews, line3Ds: HitLine3D[]): void {
		for (let i = 0; i < line3Ds.length; i++) { const h = line3Ds[i]!; const m = h.matrix.elements; line3DViews.lx[i] = h.xy.x; line3DViews.ly[i] = h.xy.y; line3DViews.zl[i] = h.zLow; line3DViews.zh[i] = h.zHigh; line3DViews.m00[i] = m[0]!; line3DViews.m01[i] = m[3]!; line3DViews.m02[i] = m[6]!; line3DViews.m10[i] = m[1]!; line3DViews.m11[i] = m[4]!; line3DViews.m12[i] = m[7]!; line3DViews.m20[i] = m[2]!; line3DViews.m21[i] = m[5]!; line3DViews.m22[i] = m[8]! }
	}
	private fillPolys(polyViews: PolyViews, polys: Hit3DPoly[]): void {
		for (let i = 0; i < polys.length; i++) {
			const h = polys[i]!
			polyViews.nx[i] = h.normal.x; polyViews.ny[i] = h.normal.y; polyViews.nz[i] = h.normal.z
			const r0 = h.rgv[0]!; polyViews.r0x[i] = r0.x; polyViews.r0y[i] = r0.y; polyViews.r0z[i] = r0.z
			polyViews.numVerts[i] = h.rgv.length
			const base = i * POLY_MAX_VERTS
			for (let j = 0; j < h.rgv.length; j++) { polyViews.vertsX[base + j] = h.rgv[j]!.x; polyViews.vertsY[base + j] = h.rgv[j]!.y }
		}
	}

	private replay(ball: Ball, coll: CollisionEvent, physics: PlayerPhysics, circleViews: CircleViews | null, planeViews: PlaneViews | null, lineViews: LineViews | null, pointViews: PointViews | null, triangleViews: TriangleViews | null, lineSegViews: LineSegViews | null, line3DViews: Line3DViews | null, polyViews: PolyViews | null): void {
		for (let i = 0; i < this._orderLen; i++) {
			const e = this._order[i]!
			if (e.kind === HitKind.Other) { e.obj.doHitTest(ball, coll, physics); continue }
			const s = e.kind === HitKind.Circle ? circleViews! : e.kind === HitKind.Plane ? planeViews! : e.kind === HitKind.LineZ ? lineViews! : e.kind === HitKind.Point ? pointViews! : e.kind === HitKind.Triangle ? triangleViews! : e.kind === HitKind.LineSeg ? lineSegViews! : e.kind === HitKind.Line3D ? line3DViews! : polyViews!
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
		const count = this.items & COUNT_MASK
		for (let i = this.start; i < this.start + count; i++) { const h = this.hitOct.getItemAt(i); if (h !== ball.hit) h.doHitTest(ball, coll, physics) }
		if (this.children.length === 0) return
		const axis = this.items >> AXIS_SHIFT, bounds = this.rectBounds, box = ball.hit.hitBBox
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
		const a = this._order, n = this._orderLen, e = a[n]
		if (e) { e.obj = o; e.kind = k; e.idx = idx } else a.push({ obj: o, kind: k, idx })
		this._orderLen++
	}

	private collect(ball: Ball): number {
		this._circles.length = 0; this._planes.length = 0; this._lineZs.length = 0; this._points.length = 0; this._triangles.length = 0; this._lineSegs.length = 0; this._line3Ds.length = 0; this._polys.length = 0; this._orderLen = 0
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
			if (isBatchCircle(h)) { this.pushOrder(h, HitKind.Circle, this._circles.length); this._circles.push(h) }
			else if (h.hitKind === HitKind.Plane) { this.pushOrder(h, HitKind.Plane, this._planes.length); this._planes.push(h as HitPlane) }
			else if (h.hitKind === HitKind.LineZ) { this.pushOrder(h, HitKind.LineZ, this._lineZs.length); this._lineZs.push(h as HitLineZ) }
			else if (isBatchPoint(h)) { this.pushOrder(h, HitKind.Point, this._points.length); this._points.push(h) }
			else if (isBatchTriangle(h)) { this.pushOrder(h, HitKind.Triangle, this._triangles.length); this._triangles.push(h) }
			else if (isBatchLine3D(h)) { this.pushOrder(h, HitKind.Line3D, this._line3Ds.length); this._line3Ds.push(h) }
			else if (isBatchLineSeg(h)) { this.pushOrder(h, HitKind.LineSeg, this._lineSegs.length); this._lineSegs.push(h) }
			else if (isBatchPoly(h)) { this.pushOrder(h, HitKind.Poly, this._polys.length); this._polys.push(h) }
			else this.pushOrder(h, HitKind.Other, -1)
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
		const dx = this.rectBounds.right - this.rectBounds.left
		const dy = this.rectBounds.bottom - this.rectBounds.top
		const dz = this.rectBounds.zhigh - this.rectBounds.zlow
		let axis: number
		if (dx > dy && dx > dz) { if (dx < 1e-4) return; axis = 0 }
		else if (dy > dz) { if (dy < 1e-4) return; axis = 1 }
		else { if (dz < 1e-4) return; axis = 2 }
		this.children = this.hitOct.allocTwoNodes()
		if (!this.children.length) return
		this.children[0].rectBounds = new FRect3D(this.rectBounds.left, this.rectBounds.right, this.rectBounds.top, this.rectBounds.bottom, this.rectBounds.zlow, this.rectBounds.zhigh)
		this.children[1].rectBounds = new FRect3D(this.rectBounds.left, this.rectBounds.right, this.rectBounds.top, this.rectBounds.bottom, this.rectBounds.zlow, this.rectBounds.zhigh)
		const vcX = (this.rectBounds.left + this.rectBounds.right) * 0.5
		const vcY = (this.rectBounds.top + this.rectBounds.bottom) * 0.5
		const vcZ = (this.rectBounds.zlow + this.rectBounds.zhigh) * 0.5
		if (axis === 0) { this.children[0].rectBounds.right = vcX; this.children[1].rectBounds.left = vcX }
		else if (axis === 1) { this.children[0].rectBounds.bottom = vcY; this.children[1].rectBounds.top = vcY }
		else { this.children[0].rectBounds.zhigh = vcZ; this.children[1].rectBounds.zlow = vcZ }
		for (const ch of this.children) { ch.hitOct = this.hitOct; ch.items = 0; ch.children.length = 0 }
		if (axis === 0) { for (let i = this.start; i < this.start + org; i++) { const h = this.hitOct.getItemAt(i).hitBBox; if (h.right < vcX) this.children[0].items++; else if (h.left > vcX) this.children[1].items++ } }
		else if (axis === 1) { for (let i = this.start; i < this.start + org; i++) { const h = this.hitOct.getItemAt(i).hitBBox; if (h.bottom < vcY) this.children[0].items++; else if (h.top > vcY) this.children[1].items++ } }
		else { for (let i = this.start; i < this.start + org; i++) { const h = this.hitOct.getItemAt(i).hitBBox; if (h.zhigh < vcZ) this.children[0].items++; else if (h.zlow > vcZ) this.children[1].items++ } }
		const leftCount = this.children[0].items, rightCount = this.children[1].items
		let levelEmptyLocal = levelEmpty, middleCount = org - leftCount - rightCount, countEmpty = 0
		if (leftCount === 0) countEmpty++; if (rightCount === 0) countEmpty++; if (middleCount === 0) countEmpty++
		if (countEmpty >= 2) levelEmptyLocal++; else levelEmptyLocal = 0
		if (levelEmptyLocal > 8) { this.hitOct.numNodes -= 2; this.children.length = 0; return }
		this.children[0].start = this.start + middleCount; this.children[1].start = this.children[0].start + leftCount
		let middle = 0; this.children[0].items = 0; this.children[1].items = 0
		if (axis === 0) { for (let i = this.start; i < this.start + org; i++) { const idx = this.hitOct.orgIdx[i]!; const h = this.hitOct.getItemAt(i).hitBBox; if (h.right < vcX) this.hitOct.tmp[this.children[0].start + this.children[0].items++] = idx; else if (h.left > vcX) this.hitOct.tmp[this.children[1].start + this.children[1].items++] = idx; else this.hitOct.orgIdx[this.start + middle++] = idx } }
		else if (axis === 1) { for (let i = this.start; i < this.start + org; i++) { const idx = this.hitOct.orgIdx[i]!; const h = this.hitOct.getItemAt(i).hitBBox; if (h.bottom < vcY) this.hitOct.tmp[this.children[0].start + this.children[0].items++] = idx; else if (h.top > vcY) this.hitOct.tmp[this.children[1].start + this.children[1].items++] = idx; else this.hitOct.orgIdx[this.start + middle++] = idx } }
		else { for (let i = this.start; i < this.start + org; i++) { const idx = this.hitOct.orgIdx[i]!; const h = this.hitOct.getItemAt(i).hitBBox; if (h.zhigh < vcZ) this.hitOct.tmp[this.children[0].start + this.children[0].items++] = idx; else if (h.zlow > vcZ) this.hitOct.tmp[this.children[1].start + this.children[1].items++] = idx; else this.hitOct.orgIdx[this.start + middle++] = idx } }
		this.items = middle | (axis << AXIS_SHIFT)
		if (this.children[0].items > 0) for (let i = 0; i < this.children[0].items; i++) this.hitOct.orgIdx[this.children[0].start + i] = this.hitOct.tmp[this.children[0].start + i]!
		if (this.children[1].items > 0) for (let i = 0; i < this.children[1].items; i++) this.hitOct.orgIdx[this.children[1].start + i] = this.hitOct.tmp[this.children[1].start + i]!
		this.children[0].createNextLevel(level + 1, levelEmptyLocal)
		this.children[1].createNextLevel(level + 1, levelEmptyLocal)
	}
}
