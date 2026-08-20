// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { ExtrudeGeometry, type Path, Shape, Vector2 } from 'three'
import { SplineVertex } from '../../util/spline-vertex.js'
import type { LightData } from '../../vpt/light/light-data.js'
import type { Table } from '../../vpt/table/table.js'

const ZERO_VEC2 = new Vector2(0, 0)
const ZERO_SIDE_UVS = [ZERO_VEC2, ZERO_VEC2, ZERO_VEC2, ZERO_VEC2]

/** Generates light insert meshes. */
export class ThreeLightMeshGenerator {
	public createLight(lightData: LightData, table: Table, depth = 5, bevel = 0.5): ExtrudeGeometry {
		const shape = this.getShape(lightData, table)
		const dim = table.getDimensions()
		const invW = 1 / dim.width
		const invH = 1 / dim.height
		const geo = new ExtrudeGeometry(shape, {
			depth,
			bevelEnabled: bevel > 0,
			bevelSegments: 1,
			steps: 1,
			bevelSize: bevel,
			bevelThickness: bevel,
			UVGenerator: {
				generateSideWallUV(): Vector2[] {
					return ZERO_SIDE_UVS
				},
				generateTopUV(_g: ExtrudeGeometry, vertices: number[], a: number, b: number, c: number): Vector2[] {
					const ax = vertices[a * 3]!,
						ay = vertices[a * 3 + 1]!
					const bx = vertices[b * 3]!,
						by = vertices[b * 3 + 1]!
					const cx = vertices[c * 3]!,
						cy = vertices[c * 3 + 1]!
					return [
						new Vector2(ax * invW, 1 - ay * invH),
						new Vector2(bx * invW, 1 - by * invH),
						new Vector2(cx * invW, 1 - cy * invH),
					]
				},
			},
		})
		if (lightData.szSurface)
			geo.translate(0, 0, -table.getSurfaceHeight(lightData.szSurface, lightData.center.x, lightData.center.y))
		geo.name = 'surface.light'
		return geo
	}

	public getShape(lightData: LightData, table: Table): Shape {
		const verts = SplineVertex.getCentralCurve(lightData.dragPoints, table.getDetailLevel(), -1)
		return this.getPathFromPoints(
			verts.map(v => new Vector2(v.x, v.y)),
			new Shape(),
		)
	}

	private getPathFromPoints<T extends Path>(points: Vector2[], path: T): T {
		if (points.length === 0) throw new Error('Cannot get path from no points.')
		path.moveTo(points[0]!.x, points[0]!.y)
		for (let i = 1; i < points.length; i++) path.lineTo(points[i]!.x, points[i]!.y)
		return path
	}
}
