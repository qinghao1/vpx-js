// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { PlayerPhysics } from '../../game/player-physics.js'
import type { Ball } from '../../vpt/ball/ball.js'
import { CollisionEvent } from '../collision-event.js'
import { CollisionType } from '../collision-type.js'
import type { Hit3DPoly } from '../hit-3dpoly.js'
import { HitCircle } from '../hit-circle.js'
import type { HitLine3D } from '../hit-line-3d.js'
import type { HitLineZ } from '../hit-line-z.js'
import { HitKind, type HitObject } from '../hit-object.js'
import type { HitPlane } from '../hit-plane.js'
import type { HitPoint } from '../hit-point.js'
import type { HitTriangle } from '../hit-triangle.js'
import { LineSeg } from '../line-seg.js'
import type {
	CircleViews,
	Line3DViews,
	LineSegViews,
	LineViews,
	PlaneViews,
	PointViews,
	PolyViews,
	TriangleViews,
} from './kernels.js'
import {
	POLY_MAX_VERTS,
	tryGetWasmBatchHitViewsOutCircle,
	tryGetWasmBatchHitViewsOutLine3D,
	tryGetWasmBatchHitViewsOutLineSeg,
	tryGetWasmBatchHitViewsOutLineZ,
	tryGetWasmBatchHitViewsOutPlane,
	tryGetWasmBatchHitViewsOutPoint,
	tryGetWasmBatchHitViewsOutPoly,
	tryGetWasmBatchHitViewsOutTriangle,
	warmWasmPools,
} from './kernels.js'

export type BatchOrder = { obj: HitObject; kind: HitKind; idx: number }
type AnyBatchViews =
	| CircleViews
	| PlaneViews
	| LineViews
	| PointViews
	| TriangleViews
	| LineSegViews
	| Line3DViews
	| PolyViews

const isBatchCircle = (h: HitObject): h is HitCircle =>
	h.hitKind === HitKind.Circle && h.hitTest === HitCircle.prototype.hitTest
const isBatchPoint = (h: HitObject): h is HitPoint => h.hitKind === HitKind.Point
const isBatchTriangle = (h: HitObject): h is HitTriangle => h.hitKind === HitKind.Triangle
const isBatchLineSeg = (h: HitObject): h is LineSeg =>
	h.hitKind === HitKind.LineSeg && h.hitTest === LineSeg.prototype.hitTest
const isBatchLine3D = (h: HitObject): h is HitLine3D => h.hitKind === HitKind.Line3D
const isBatchPoly = (h: HitObject): h is Hit3DPoly =>
	h.hitKind === HitKind.Poly &&
	(h as Hit3DPoly).objType !== CollisionType.Trigger &&
	(h as Hit3DPoly).rgv.length <= POLY_MAX_VERTS
/** Batched (WASM) hit tests only pay off above this many post-cull candidates. */
export const WASM_THRESHOLD = 64

/** Per-kind batchable counts in warmWasmPools() argument order. */
export function countBatchables(
	hits: Iterable<HitObject>,
): [number, number, number, number, number, number, number, number] {
	let circle = 0,
		plane = 0,
		lineZ = 0,
		point = 0,
		triangle = 0,
		lineSeg = 0,
		line3D = 0,
		poly = 0
	for (const h of hits) {
		if (isBatchCircle(h)) circle++
		else if (h.hitKind === HitKind.Plane) plane++
		else if (h.hitKind === HitKind.LineZ) lineZ++
		else if (isBatchPoint(h)) point++
		else if (isBatchTriangle(h)) triangle++
		else if (isBatchLine3D(h)) line3D++
		else if (isBatchLineSeg(h)) lineSeg++
		else if (isBatchPoly(h)) poly++
	}
	return [circle, plane, lineZ, point, triangle, lineSeg, line3D, poly]
}

/** Reusable per-tree batch state: kind arrays, replay order, and acquired views. */
export class BatchCollector {
	readonly circles: HitCircle[] = []
	readonly planes: HitPlane[] = []
	readonly lineZs: HitLineZ[] = []
	readonly points: HitPoint[] = []
	readonly triangles: HitTriangle[] = []
	readonly lineSegs: LineSeg[] = []
	readonly line3Ds: HitLine3D[] = []
	readonly polys: Hit3DPoly[] = []
	readonly order: BatchOrder[] = []
	readonly views: {
		circle: CircleViews | null
		plane: PlaneViews | null
		lineZ: LineViews | null
		point: PointViews | null
		triangle: TriangleViews | null
		lineSeg: LineSegViews | null
		line3D: Line3DViews | null
		poly: PolyViews | null
	} = { circle: null, plane: null, lineZ: null, point: null, triangle: null, lineSeg: null, line3D: null, poly: null }
	orderLen = 0

	reset(): void {
		this.circles.length = 0
		this.planes.length = 0
		this.lineZs.length = 0
		this.points.length = 0
		this.triangles.length = 0
		this.lineSegs.length = 0
		this.line3Ds.length = 0
		this.polys.length = 0
		this.orderLen = 0
	}

	classify(hit: HitObject): void {
		switch (hit.hitKind) {
			case HitKind.Circle:
				if (hit.hitTest === HitCircle.prototype.hitTest) {
					this.pushOrder(hit, HitKind.Circle, this.circles.length)
					this.circles.push(hit as HitCircle)
				} else this.pushOrder(hit, HitKind.Other, -1)
				return
			case HitKind.Plane:
				this.pushOrder(hit, HitKind.Plane, this.planes.length)
				this.planes.push(hit as HitPlane)
				return
			case HitKind.LineZ:
				this.pushOrder(hit, HitKind.LineZ, this.lineZs.length)
				this.lineZs.push(hit as HitLineZ)
				return
			case HitKind.Point:
				this.pushOrder(hit, HitKind.Point, this.points.length)
				this.points.push(hit as HitPoint)
				return
			case HitKind.Triangle:
				this.pushOrder(hit, HitKind.Triangle, this.triangles.length)
				this.triangles.push(hit as HitTriangle)
				return
			case HitKind.Line3D:
				this.pushOrder(hit, HitKind.Line3D, this.line3Ds.length)
				this.line3Ds.push(hit as HitLine3D)
				return
			case HitKind.LineSeg:
				if (hit.hitTest === LineSeg.prototype.hitTest) {
					this.pushOrder(hit, HitKind.LineSeg, this.lineSegs.length)
					this.lineSegs.push(hit as LineSeg)
				} else this.pushOrder(hit, HitKind.Other, -1)
				return
			case HitKind.Poly: {
				const poly = hit as Hit3DPoly
				if (poly.objType !== CollisionType.Trigger && poly.rgv.length <= POLY_MAX_VERTS) {
					this.pushOrder(hit, HitKind.Poly, this.polys.length)
					this.polys.push(poly)
				} else this.pushOrder(hit, HitKind.Other, -1)
				return
			}
			default:
				this.pushOrder(hit, HitKind.Other, -1)
		}
	}

	private pushOrder(o: HitObject, k: HitKind, idx: number): void {
		const a = this.order,
			n = this.orderLen,
			e = a[n]
		if (e) {
			e.obj = o
			e.kind = k
			e.idx = idx
		} else a.push({ obj: o, kind: k, idx })
		this.orderLen++
	}

	/**
	 * Fill, run, and replay the collected batches. Returns false when WASM
	 * pools must grow first — the caller falls back to scalar for this step.
	 */
	run(ball: Ball, coll: CollisionEvent, physics: PlayerPhysics): boolean {
		// Shared small-tree path for every tree type: below-threshold batches
		// replay scalar in collection order. Callers must not add their own
		// pre-cull size gate; pre-cull totals overcount culled candidates.
		if (this.orderLen < WASM_THRESHOLD) {
			for (let i = 0; i < this.orderLen; i++) this.order[i]!.obj.doHitTest(ball, coll, physics)
			return true
		}
		const { circles, planes, lineZs, points, triangles, lineSegs, line3Ds, polys, views } = this
		views.circle = circles.length ? tryGetWasmBatchHitViewsOutCircle(circles.length) : null
		views.plane = planes.length ? tryGetWasmBatchHitViewsOutPlane(planes.length) : null
		views.lineZ = lineZs.length ? tryGetWasmBatchHitViewsOutLineZ(lineZs.length) : null
		views.point = points.length ? tryGetWasmBatchHitViewsOutPoint(points.length) : null
		views.triangle = triangles.length ? tryGetWasmBatchHitViewsOutTriangle(triangles.length) : null
		views.lineSeg = lineSegs.length ? tryGetWasmBatchHitViewsOutLineSeg(lineSegs.length) : null
		views.line3D = line3Ds.length ? tryGetWasmBatchHitViewsOutLine3D(line3Ds.length) : null
		views.poly = polys.length ? tryGetWasmBatchHitViewsOutPoly(polys.length) : null
		if (
			(circles.length && !views.circle) ||
			(planes.length && !views.plane) ||
			(lineZs.length && !views.lineZ) ||
			(points.length && !views.point) ||
			(triangles.length && !views.triangle) ||
			(lineSegs.length && !views.lineSeg) ||
			(line3Ds.length && !views.line3D) ||
			(polys.length && !views.poly)
		) {
			warmWasmPools(
				circles.length,
				planes.length,
				lineZs.length,
				points.length,
				triangles.length,
				lineSegs.length,
				line3Ds.length,
				polys.length,
			)
			return false
		}
		if (views.circle) fillCircles(views.circle, circles)
		if (views.plane) fillPlanes(views.plane, planes)
		if (views.lineZ) fillLineZs(views.lineZ, lineZs)
		if (views.point) fillPoints(views.point, points)
		if (views.triangle) fillTriangles(views.triangle, triangles)
		if (views.lineSeg) fillLineSegs(views.lineSeg, lineSegs)
		if (views.line3D) fillLine3Ds(views.line3D, line3Ds)
		if (views.poly) fillPolys(views.poly, polys)
		const pos = ball.state.pos,
			vel = ball.hit.vel,
			r = ball.data.radius,
			dt = coll.hitTime
		if (views.circle) views.circle.run(pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, r, dt)
		if (views.plane) views.plane.run(pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, r, dt)
		if (views.lineZ) views.lineZ.run(pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, r, dt)
		if (views.point) views.point.run(pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, r, dt)
		if (views.triangle) views.triangle.run(pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, r, dt)
		if (views.lineSeg) views.lineSeg.run(pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, r, dt)
		if (views.line3D) views.line3D.run(pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, r, dt)
		if (views.poly) views.poly.run(pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, r, dt)
		this.replay(ball, coll, physics)
		return true
	}

	/** Replays acquired views in collection order, writing the winning hit into coll. */
	replay(ball: Ball, coll: CollisionEvent, physics: PlayerPhysics): void {
		const views = this.views
		// Computed enum keys keep this robust to HitKind order; Other is handled above.
		const byKind = {
			[HitKind.Circle]: views.circle,
			[HitKind.Plane]: views.plane,
			[HitKind.LineZ]: views.lineZ,
			[HitKind.Line3D]: views.line3D,
			[HitKind.Point]: views.point,
			[HitKind.Triangle]: views.triangle,
			[HitKind.LineSeg]: views.lineSeg,
			[HitKind.Poly]: views.poly,
		}
		for (let i = 0; i < this.orderLen; i++) {
			const e = this.order[i]!
			if (e.kind === HitKind.Other) {
				e.obj.doHitTest(ball, coll, physics)
				continue
			}
			const s: AnyBatchViews = byKind[e.kind]!
			const t = s.oT[e.idx]!,
				contact = s.oContact[e.idx]!,
				nx = s.oNx[e.idx]!,
				ny = s.oNy[e.idx]!,
				nz = s.oNz[e.idx]!,
				dist = s.oDist[e.idx]!,
				bnv = s.oBnv[e.idx]!
			const isContact = !!contact,
				valid = t >= -0.5 && t <= coll.hitTime
			if (!isContact && !valid) continue
			if (!physics.recordContacts) {
				if (!valid) continue
				// Match scalar doHitTest, which coll.set()s a fresh (reset)
				// CollisionEvent: per-hit fields the kernels never emit must be
				// reset, not left stale. Kernels write oBnv=0 for non-contacts.
				coll.hitNormal.x = nx
				coll.hitNormal.y = ny
				coll.hitNormal.z = nz
				coll.hitDistance = dist
				coll.isContact = isContact
				coll.hitOrgNormalVelocity = bnv
				coll.hitVel.setZero()
				coll.hitMomentBit = true
				coll.hitFlag = false
				coll.ball = ball
				coll.obj = e.obj
				coll.hitTime = t
			} else {
				const nc = CollisionEvent.claim(ball)
				nc.hitNormal.x = nx
				nc.hitNormal.y = ny
				nc.hitNormal.z = nz
				nc.hitDistance = dist
				nc.isContact = isContact
				nc.hitOrgNormalVelocity = bnv
				if (valid) {
					nc.ball = ball
					nc.obj = e.obj
					if (isContact) physics.contacts.push(nc)
					else {
						coll.set(nc)
						coll.hitTime = t
						CollisionEvent.releaseOne(nc)
					}
				} else CollisionEvent.releaseOne(nc)
			}
		}
	}
}

function fillCircles(circleViews: CircleViews, circles: HitCircle[]): void {
	for (let i = 0; i < circles.length; i++) {
		const h = circles[i]!
		circleViews.cx[i] = h.center.x
		circleViews.cy[i] = h.center.y
		circleViews.cr[i] = h.radius
		circleViews.zl[i] = h.hitBBox.zlow
		circleViews.zh[i] = h.hitBBox.zhigh
	}
}
function fillPlanes(planeViews: PlaneViews, planes: HitPlane[]): void {
	for (let i = 0; i < planes.length; i++) {
		const h = planes[i]!
		planeViews.nx[i] = h.normal.x
		planeViews.ny[i] = h.normal.y
		planeViews.nz[i] = h.normal.z
		planeViews.d[i] = h.d
	}
}
function fillLineZs(lineViews: LineViews, lineZs: HitLineZ[]): void {
	for (let i = 0; i < lineZs.length; i++) {
		const h = lineZs[i]!
		lineViews.lx[i] = h.xy.x
		lineViews.ly[i] = h.xy.y
		lineViews.zl[i] = h.hitBBox.zlow
		lineViews.zh[i] = h.hitBBox.zhigh
	}
}
function fillPoints(pointViews: PointViews, points: HitPoint[]): void {
	for (let i = 0; i < points.length; i++) {
		const h = points[i]!
		pointViews.px[i] = h.p.x
		pointViews.py[i] = h.p.y
		pointViews.pz[i] = h.p.z
	}
}
function fillTriangles(triangleViews: TriangleViews, triangles: HitTriangle[]): void {
	for (let i = 0; i < triangles.length; i++) {
		const h = triangles[i]!
		const r0 = h.rgv[0]!,
			r1 = h.rgv[1]!,
			r2 = h.rgv[2]!
		triangleViews.r0x[i] = r0.x
		triangleViews.r0y[i] = r0.y
		triangleViews.r0z[i] = r0.z
		triangleViews.r1x[i] = r1.x
		triangleViews.r1y[i] = r1.y
		triangleViews.r1z[i] = r1.z
		triangleViews.r2x[i] = r2.x
		triangleViews.r2y[i] = r2.y
		triangleViews.r2z[i] = r2.z
		triangleViews.nx[i] = h.normal.x
		triangleViews.ny[i] = h.normal.y
		triangleViews.nz[i] = h.normal.z
	}
}
function fillLineSegs(lineSegViews: LineSegViews, lineSegs: LineSeg[]): void {
	for (let i = 0; i < lineSegs.length; i++) {
		const h = lineSegs[i]!
		lineSegViews.v1x[i] = h.v1.x
		lineSegViews.v1y[i] = h.v1.y
		lineSegViews.v2x[i] = h.v2.x
		lineSegViews.v2y[i] = h.v2.y
		lineSegViews.nx[i] = h.normal.x
		lineSegViews.ny[i] = h.normal.y
		lineSegViews.len[i] = h.length
		lineSegViews.zl[i] = h.hitBBox.zlow
		lineSegViews.zh[i] = h.hitBBox.zhigh
	}
}
function fillLine3Ds(line3DViews: Line3DViews, line3Ds: HitLine3D[]): void {
	for (let i = 0; i < line3Ds.length; i++) {
		const h = line3Ds[i]!
		const m = h.matrix.elements
		line3DViews.lx[i] = h.xy.x
		line3DViews.ly[i] = h.xy.y
		line3DViews.zl[i] = h.zLow
		line3DViews.zh[i] = h.zHigh
		line3DViews.m00[i] = m[0]!
		line3DViews.m01[i] = m[3]!
		line3DViews.m02[i] = m[6]!
		line3DViews.m10[i] = m[1]!
		line3DViews.m11[i] = m[4]!
		line3DViews.m12[i] = m[7]!
		line3DViews.m20[i] = m[2]!
		line3DViews.m21[i] = m[5]!
		line3DViews.m22[i] = m[8]!
	}
}
function fillPolys(polyViews: PolyViews, polys: Hit3DPoly[]): void {
	for (let i = 0; i < polys.length; i++) {
		const h = polys[i]!
		polyViews.nx[i] = h.normal.x
		polyViews.ny[i] = h.normal.y
		polyViews.nz[i] = h.normal.z
		const r0 = h.rgv[0]!
		polyViews.r0x[i] = r0.x
		polyViews.r0y[i] = r0.y
		polyViews.r0z[i] = r0.z
		polyViews.numVerts[i] = h.rgv.length
		const base = i * POLY_MAX_VERTS
		for (let j = 0; j < h.rgv.length; j++) {
			polyViews.vertsX[base + j] = h.rgv[j]!.x
			polyViews.vertsY[base + j] = h.rgv[j]!.y
		}
	}
}
