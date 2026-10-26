// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { ExtrudeGeometry, type Path, Shape, ShapeGeometry, Vector2 } from 'three'
import { SplineVertex } from '../../util/spline-vertex.js'
import type { LightData } from '../../vpt/light/light.js'
import type { Table } from '../../vpt/table/table.js'
import { playfieldUvGenerator } from './three-mesh-generator.js'

/** Generates light insert meshes. */
export class ThreeLightMeshGenerator {
	public createLight(lightData: LightData, table: Table, depth = 5, bevel = 0.5): ExtrudeGeometry {
		const shape = this.getShape(lightData, table)
		const dim = table.getDimensions()
		const geo = new ExtrudeGeometry(shape, {
			depth,
			bevelEnabled: bevel > 0,
			bevelSegments: 1,
			steps: 1,
			bevelSize: bevel,
			bevelThickness: bevel,
			UVGenerator: playfieldUvGenerator(1 / dim.width, 1 / dim.height),
		})
		if (lightData.szSurface)
			geo.translate(0, 0, -table.getSurfaceHeight(lightData.szSurface, lightData.center.x, lightData.center.y))
		geo.name = 'surface.light'
		return geo
	}

	/**
	 * Flat additive glow polygon for bulb lights.
	 *
	 * Mirrors the native lightmap pass (`Light::UpdateMeshBuffer`: triangulated
	 * drag-point polygon lifted to `surfaceHeight + bulbHaloHeight + 0.1`, rendered
	 * additive in `light.cpp`). Flat, because the glow is a light composite, not
	 * solid geometry — unlike the extruded surface-light mesh above.
	 * @see https://github.com/vpinball/vpinball/blob/master/src/parts/light.cpp
	 */
	public createBulbGlowGeometry(lightData: LightData, table: Table): ShapeGeometry {
		const geo = new ShapeGeometry(this.getShape(lightData, table))
		let surfaceHeight = 0
		if (lightData.szSurface) {
			surfaceHeight = table.getSurfaceHeight(lightData.szSurface, lightData.center.x, lightData.center.y)
		}
		// Negated like createLight above: scene space maps local +z to world
		// -y (transformScene rotateX), so table-up must be built as local -z.
		// The +0.1 epsilon (table units) floats the quad just off the insert
		// surface to avoid z-fighting; upstream needs none (separate lightmap pass).
		geo.translate(0, 0, -(surfaceHeight + (lightData.bulbLight ? lightData.bulbHaloHeight : 0) + 0.1))
		geo.name = 'bulb.glow'
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
