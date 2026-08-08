// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { degToRad, f4 } from '../../util/float.js'
import { Matrix3D, Vertex3D } from '../../util/math.js'
import type { Mesh } from '../mesh.js'
import { loadMesh } from '../mesh-loader.js'
import type { Table } from '../table/table.js'
import type { FlipperData } from './flipper-data.js'

const flipperBaseMesh = loadMesh('flipper-base-mesh')

/** Flipper mesh. @see https://github.com/vpinball/vpinball/blob/master/flipper.cpp */
export class FlipperMesh {
	public generateMeshes(data: FlipperData, table: Table): { base: Mesh; rubber?: Mesh } {
		const m = new Matrix3D().rotateZMatrix(degToRad(180))
		const height = table.getSurfaceHeight(data.szSurface, data.center.x, data.center.y)
		const baseRadius = f4(data.baseRadius - data.rubberThickness)
		const endRadius = f4(data.endRadius - data.rubberThickness)
		const baseScale = 10
		const base = flipperBaseMesh.clone(`flipper.base-${data.getName()}`)
		this.applyScale(base, data, baseRadius, endRadius, baseScale)
		base.transform(m, undefined, z => f4(f4(z * data.height) * table.getScaleZ()) + height)
		if (data.rubberThickness <= 0) return { base }
		const rubber = flipperBaseMesh.clone(`flipper.rubber-${data.getName()}`)
		this.applyScale(rubber, data, data.baseRadius, data.endRadius, baseScale, true)
		rubber.transform(
			m,
			undefined,
			z => f4(f4(z * data.rubberWidth) * table.getScaleZ()) + f4(height + data.rubberHeight),
		)
		return { base, rubber }
	}

	private applyScale(
		mesh: Mesh,
		data: FlipperData,
		baseR: number,
		endR: number,
		scale: number,
		isRubber = false,
	): void {
		for (let t = 0; t < 13; t++) {
			for (const v of mesh.vertices) {
				if (this.match(v, FlipperMesh.vertsBaseBottom[t]!)) {
					if (isRubber) {
						v.x = f4(v.x * baseR) * scale
						v.y = f4(v.y * baseR) * scale
					} else {
						v.x *= f4(baseR * scale)
						v.y *= f4(baseR * scale)
					}
				} else if (this.match(v, FlipperMesh.vertsTipBottom[t]!)) {
					if (isRubber) {
						v.x = f4(v.x * endR) * scale
						v.y = f4(v.y * endR) * scale
						v.y = f4(v.y + data.flipperRadius) - f4(endR * 7.9)
					} else {
						v.x *= f4(endR * scale)
						v.y *= f4(endR * scale)
						v.y += data.flipperRadius - f4(endR * 7.9)
					}
				} else if (this.match(v, FlipperMesh.vertsBaseTop[t]!)) {
					if (isRubber) {
						v.x = f4(v.x * baseR) * scale
						v.y = f4(v.y * baseR) * scale
					} else {
						v.x *= f4(baseR * scale)
						v.y *= f4(baseR * scale)
					}
				} else if (this.match(v, FlipperMesh.vertsTipTop[t]!)) {
					if (isRubber) {
						v.x = f4(v.x * endR) * scale
						v.y = f4(v.y * endR) * scale
						v.y = f4(v.y + data.flipperRadius) - f4(endR * 7.9)
					} else {
						v.x *= f4(endR * scale)
						v.y *= f4(endR * scale)
						v.y += data.flipperRadius - f4(endR * 7.9)
					}
				}
			}
		}
	}

	private match(a: { x: number; y: number; z: number }, b: Vertex3D): boolean {
		return a.x === b.x && a.y === b.y && a.z === b.z
	}

	private static vertsTipBottom = [
		new Vertex3D(-0.101425, 0.786319, 0.003753),
		new Vertex3D(-0.097969, 0.812569, 0.003753),
		new Vertex3D(-0.087837, 0.837031, 0.003753),
		new Vertex3D(-0.071718, 0.858037, 0.003753),
		new Vertex3D(-0.050713, 0.874155, 0.003753),
		new Vertex3D(-0.026251, 0.884288, 0.003753),
		new Vertex3D(-0.0, 0.887744, 0.003753),
		new Vertex3D(0.026251, 0.884288, 0.003753),
		new Vertex3D(0.050713, 0.874155, 0.003753),
		new Vertex3D(0.071718, 0.858037, 0.003753),
		new Vertex3D(0.087837, 0.837031, 0.003753),
		new Vertex3D(0.097969, 0.812569, 0.003753),
		new Vertex3D(0.101425, 0.786319, 0.003753),
	]

	private static vertsTipTop = [
		new Vertex3D(-0.101425, 0.786319, 1.004253),
		new Vertex3D(-0.097969, 0.812569, 1.004253),
		new Vertex3D(-0.087837, 0.837031, 1.004253),
		new Vertex3D(-0.071718, 0.858037, 1.004253),
		new Vertex3D(-0.050713, 0.874155, 1.004253),
		new Vertex3D(-0.026251, 0.884288, 1.004253),
		new Vertex3D(-0.0, 0.887744, 1.004253),
		new Vertex3D(0.026251, 0.884288, 1.004253),
		new Vertex3D(0.050713, 0.874155, 1.004253),
		new Vertex3D(0.071718, 0.858037, 1.004253),
		new Vertex3D(0.087837, 0.837031, 1.004253),
		new Vertex3D(0.097969, 0.812569, 1.004253),
		new Vertex3D(0.101425, 0.786319, 1.004253),
	]

	private static vertsBaseBottom = [
		new Vertex3D(-0.100762, -0.0, 0.003753),
		new Vertex3D(-0.097329, -0.026079, 0.003753),
		new Vertex3D(-0.087263, -0.050381, 0.003753),
		new Vertex3D(-0.07125, -0.07125, 0.003753),
		new Vertex3D(-0.050381, -0.087263, 0.003753),
		new Vertex3D(-0.026079, -0.097329, 0.003753),
		new Vertex3D(-0.0, -0.100762, 0.003753),
		new Vertex3D(0.026079, -0.097329, 0.003753),
		new Vertex3D(0.050381, -0.087263, 0.003753),
		new Vertex3D(0.07125, -0.07125, 0.003753),
		new Vertex3D(0.087263, -0.050381, 0.003753),
		new Vertex3D(0.097329, -0.026079, 0.003753),
		new Vertex3D(0.100762, -0.0, 0.003753),
	]

	private static vertsBaseTop = [
		new Vertex3D(-0.100762, 0.0, 1.004253),
		new Vertex3D(-0.097329, -0.026079, 1.004253),
		new Vertex3D(-0.087263, -0.050381, 1.004253),
		new Vertex3D(-0.07125, -0.07125, 1.004253),
		new Vertex3D(-0.050381, -0.087263, 1.004253),
		new Vertex3D(-0.026079, -0.097329, 1.004253),
		new Vertex3D(-0.0, -0.100762, 1.004253),
		new Vertex3D(0.026079, -0.097329, 1.004253),
		new Vertex3D(0.050381, -0.087263, 1.004253),
		new Vertex3D(0.07125, -0.07125, 1.004253),
		new Vertex3D(0.087263, -0.050381, 1.004253),
		new Vertex3D(0.097329, -0.026079, 1.004253),
		new Vertex3D(0.100762, -0.0, 1.004253),
	]
}
