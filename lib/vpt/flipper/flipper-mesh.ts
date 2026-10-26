// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { MathUtils } from 'three'
import { Matrix3D } from '../../math/matrix.js'
import { Vertex3D } from '../../math/vector.js'
import type { Mesh } from '../mesh.js'
import { loadMesh } from '../mesh-loader.js'
import type { Table } from '../table/table.js'
import type { FlipperData } from './flipper-data.js'

const flipperBaseMesh = loadMesh('flipper-base-mesh')

/** Flipper mesh. @see https://github.com/vpinball/vpinball/blob/master/flipper.cpp */
export class FlipperMesh {
	public generateMeshes(data: FlipperData, table: Table): { base: Mesh; rubber?: Mesh } {
		const rotation = new Matrix3D().rotateZMatrix(MathUtils.degToRad(180))
		const height = table.getSurfaceHeight(data.szSurface, data.center.x, data.center.y)
		const baseRadius = data.baseRadius - data.rubberThickness
		const endRadius = data.endRadius - data.rubberThickness
		const base = flipperBaseMesh.clone(`flipper.base-${data.getName()}`)
		this.applyScale(base, data, baseRadius, endRadius)
		base.transform(rotation, undefined, z => z * data.height * table.getScaleZ() + height)
		if (data.rubberThickness <= 0) return { base }
		const rubber = flipperBaseMesh.clone(`flipper.rubber-${data.getName()}`)
		this.applyScale(rubber, data, data.baseRadius, data.endRadius)
		rubber.transform(
			rotation,
			undefined,
			z => z * data.rubberWidth * table.getScaleZ() + (height + data.rubberHeight),
		)
		return { base, rubber }
	}

	private applyScale(mesh: Mesh, data: FlipperData, baseRadius: number, endRadius: number): void {
		// taper correction, see Flipper::GenerateBaseMesh in upstream src/parts/flipper.cpp
		const fixAngle = Math.asin(MathUtils.clamp((data.baseRadius - data.endRadius) / data.flipperRadius, -1, 1))
		const fixAngleScale = fixAngle / (Math.PI * 0.5)
		const baseCenterX = FlipperMesh.vertsBaseBottom[6]!.x
		const baseCenterY = FlipperMesh.vertsBaseBottom[0]!.y
		const tipCenterX = FlipperMesh.vertsTipBottom[6]!.x
		const tipCenterY = FlipperMesh.vertsTipBottom[0]!.y
		// Each vertex matches at most one arc point, so one pass over both arcs fixes each vertex once.
		const baseArc = FlipperMesh.vertsBaseBottom.concat(FlipperMesh.vertsBaseTop)
		const tipArc = FlipperMesh.vertsTipBottom.concat(FlipperMesh.vertsTipTop)
		for (const vertex of mesh.vertices) {
			if (baseArc.some(arc => this.match(vertex, arc))) {
				this.applyFix(vertex, baseCenterX, baseCenterY, -Math.PI * 0.5, baseRadius, 0, 0, fixAngleScale)
			} else if (tipArc.some(arc => this.match(vertex, arc))) {
				this.applyFix(
					vertex,
					tipCenterX,
					tipCenterY,
					Math.PI * 0.5,
					endRadius,
					0,
					data.flipperRadius,
					fixAngleScale,
				)
			}
		}
	}

	// Reconstructs arc vertices at the exact radius with the taper correction. Upstream ApplyFix also adjusts
	// normals, but GenerateBaseMesh discards them (it keeps the base mesh normals), so only positions are ported.
	private applyFix(
		vertex: { x: number; y: number },
		centerX: number,
		centerY: number,
		midAngle: number,
		radius: number,
		newCenterX: number,
		newCenterY: number,
		fixAngleScale: number,
	): void {
		let vertexAngle = Math.atan2(vertex.y - centerY, vertex.x - centerX)
		if (midAngle < 0) {
			if (vertexAngle > 0) vertexAngle -= Math.PI * 2
		} else if (vertexAngle < 0) {
			vertexAngle += Math.PI * 2
		}
		vertexAngle -= (vertexAngle - midAngle) * fixAngleScale * Math.sign(midAngle)
		vertex.x = Math.cos(vertexAngle) * radius + newCenterX
		vertex.y = Math.sin(vertexAngle) * radius + newCenterY
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
