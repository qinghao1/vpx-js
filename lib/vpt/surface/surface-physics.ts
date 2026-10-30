// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { EventProxy } from '../../game/event-proxy.js'
import { Vertex3D } from '../../math/vector.js'
import { Hit3DPoly } from '../../physics/hit-3dpoly.js'
import { HitLine3D } from '../../physics/hit-line-3d.js'
import { HitLineZ } from '../../physics/hit-line-z.js'
import type { HitObject } from '../../physics/hit-object.js'
import { HitPoint } from '../../physics/hit-point.js'
import { LineSeg } from '../../physics/line-seg.js'
import { LineSegSlingshot } from '../../physics/line-seg-slingshot.js'
import { CatmullCurve2D } from '../../util/catmull-curve.js'
import { RenderVertex } from '../../util/vertex.js'
import { DragPoint } from '../dragpoint.js'
import type { Table } from '../table/table.js'
import type { Surface, SurfaceData } from './surface.js'

function findCornerVertex(vertices: RenderVertex[]): number {
	let minVertex = 0
	let minY = Infinity
	let minXAtMinY = Infinity
	for (let i = 0; i < vertices.length; i++) {
		const v = vertices[i]!
		if (v.y > minY) continue
		if (v.y === minY && v.x >= minXAtMinY) continue
		minVertex = i
		minY = v.y
		minXAtMinY = v.x
	}
	return minVertex
}

/**
 * Restores canonical (counterclockwise) winding, returning whether the order was reversed.
 * The slingshot flag belongs to the edge starting at its vertex, so it shifts with the reversal.
 * @see NormalizeWindingOrder in src/math/MeshUtils.h
 */
export function normalizeWindingOrder(vVertex: RenderVertex[]): boolean {
	const count = vVertex.length
	if (count <= 2) return false
	const nVerts =
		vVertex[count - 1]!.x === vVertex[0]!.x && vVertex[count - 1]!.y === vVertex[0]!.y ? count - 1 : count
	const iMin = findCornerVertex(vVertex.slice(0, nVerts))
	const a = vVertex[(iMin - 1 + nVerts) % nVerts]!
	const b = vVertex[iMin]!
	const c = vVertex[(iMin + 1) % nVerts]!
	const det = b.x * c.y + a.x * b.y + a.y * c.x - (a.y * b.x + b.y * c.x + a.x * c.y)
	if (det <= 0) return false
	vVertex.reverse()
	const sling = vVertex[0]!.fSlingshot
	for (let i = 0; i + 1 < count; ++i) vVertex[i]!.fSlingshot = vVertex[i + 1]!.fSlingshot
	vVertex[count - 1]!.fSlingshot = sling
	return true
}

/** @see https://github.com/vpinball/vpinball/blob/master/surface.cpp */
export class SurfaceHitGenerator {
	public lineSling: LineSegSlingshot[] = []

	constructor(
		private readonly surface: Surface,
		private readonly data: SurfaceData,
	) {}

	public generateHitObjects(events: EventProxy, table: Table): HitObject[] {
		return this.updateCommonParameters(this.generate3DPolys(events, table), events, table)
	}

	private generate3DPolys(events: EventProxy, table: Table): HitObject[] {
		const hitObjects: HitObject[] = []
		const vVertex = DragPoint.getRgVertex(
			this.data.dragPoints,
			() => new RenderVertex(),
			CatmullCurve2D.fromVertex2D,
		)
		// One-sided colliders expect canonical winding, otherwise the wall traps balls.
		const reversedWinding = normalizeWindingOrder(vVertex)
		const count = vVertex.length
		const rgv3Dt: Vertex3D[] = []
		const rgv3Db: Vertex3D[] | null = this.data.isBottomSolid ? [] : null
		const bottom = this.data.heightBottom + table.getTableHeight()
		const top = this.data.heightTop + table.getTableHeight()
		for (let i = 0; i < count; ++i) {
			const pv1 = vVertex[i]!
			rgv3Dt[i] = new Vertex3D(pv1.x, pv1.y, top)
			if (rgv3Db) rgv3Db[count - 1 - i] = new Vertex3D(pv1.x, pv1.y, bottom)
			const pv2 = vVertex[(i + 1) % count]!
			const pv3 = vVertex[(i + 2) % count]!
			hitObjects.push(...this.generateLinePolys(pv2, pv3, events, table, reversedWinding))
		}
		hitObjects.push(new Hit3DPoly(rgv3Dt))
		if (rgv3Db) hitObjects.push(new Hit3DPoly(rgv3Db))
		return hitObjects
	}

	private generateLinePolys(
		pv1: RenderVertex,
		pv2: RenderVertex,
		events: EventProxy,
		table: Table,
		bothDirections: boolean,
	): HitObject[] {
		const linePolys: HitObject[] = []
		const bottom = this.data.heightBottom + table.getTableHeight()
		const top = this.data.heightTop + table.getTableHeight()
		const addLineSeg = (pa: RenderVertex, pb: RenderVertex, slingMesh: boolean): void => {
			if (!pv1.fSlingshot) {
				linePolys.push(new LineSeg(pa, pb, bottom, top))
			} else {
				const slingLine = new LineSegSlingshot(this.surface, this.data, pa, pb, bottom, top)
				slingLine.force = this.data.slingshotForce
				slingLine.obj = events
				slingLine.fe = true
				slingLine.threshold = this.data.threshold!
				linePolys.push(slingLine)
				if (slingMesh) this.lineSling.push(slingLine)
			}
		}
		if (!bothDirections) {
			addLineSeg(pv1, pv2, true)
		} else {
			// Reversed outlines relied on inward-facing colliders (see #4149), so collide both
			// ways. The authored direction keeps the slingshot mesh. (Upstream also links the
			// canonical segment to animate it, but vpx-js slingshots have no arm animation.)
			addLineSeg(pv1, pv2, false)
			addLineSeg(pv2, pv1, true)
		}
		if (this.data.heightBottom !== 0) {
			linePolys.push(new HitLine3D(new Vertex3D(pv1.x, pv1.y, bottom), new Vertex3D(pv2.x, pv2.y, bottom)))
		}
		linePolys.push(new HitLine3D(new Vertex3D(pv1.x, pv1.y, top), new Vertex3D(pv2.x, pv2.y, top)))
		linePolys.push(new HitLineZ(pv1, bottom, top))
		if (this.data.heightBottom !== 0) linePolys.push(new HitPoint(new Vertex3D(pv1.x, pv1.y, bottom)))
		linePolys.push(new HitPoint(new Vertex3D(pv1.x, pv1.y, top)))
		return linePolys
	}

	private updateCommonParameters(hitObjects: HitObject[], events: EventProxy, table: Table): HitObject[] {
		for (const obj of hitObjects) {
			obj.applyPhysics(this.data, table)
			if (this.data.hitEvent) {
				obj.obj = events
				obj.fe = true
				obj.threshold = this.data.threshold!
			}
		}
		return hitObjects
	}
}
