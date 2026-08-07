// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { EventProxy } from '../../game/event-proxy.js'
import { CollisionType } from '../../physics/collision-type.js'
import type { HitObject } from '../../physics/hit-object.js'
import { HitPoint } from '../../physics/hit-point.js'
import { HitTriangle } from '../../physics/hit-triangle.js'
import { EdgeSet } from '../../util/edge-set.js'
import { degToRad } from '../../util/float.js'
import { clamp } from '../../util/functions.js'
import type { Vertex3D } from '../../util/math.js'
import {
	ProgMeshFloat3,
	ProgMeshTriData,
	permuteVertices,
	progressiveMesh,
	remapIndices,
} from '../../util/progressive-mesh.js'
import { Vertex3DNoTex2 } from '../../util/vertex.js'
import { Mesh } from '../mesh.js'
import type { Table } from '../table/table.js'
import type { PrimitiveData } from './primitive-data.js'

/** Primitive hit generator. @see https://github.com/vpinball/vpinball/blob/master/primitive.cpp */
export class PrimitiveHitGenerator {
	constructor(private readonly data: PrimitiveData) {}

	public generateHitObjects(mesh: Mesh, events: EventProxy, table: Table): HitObject[] {
		const hitObjects: HitObject[] = []
		if (this.data.getName() === 'playfield_mesh') {
			this.data.isVisible = false
			this.data.useAsPlayfield = true
		}
		if (this.data.isToy && !this.data.useAsPlayfield) return []
		const reducedVertices = Math.floor(
			Math.max(mesh.vertices.length ** (clamp(1 - this.data.collisionReductionFactor, 0, 1) * 0.25 + 0.75), 420),
		)
		if (reducedVertices < mesh.vertices.length) mesh = this.getReducedMesh(mesh, reducedVertices)
		const addedEdges = new EdgeSet()
		for (let i = 0; i < mesh.indices.length; i += 3) {
			const i0 = mesh.indices[i]!
			const i1 = mesh.indices[i + 1]!
			const i2 = mesh.indices[i + 2]!
			const rgv3D: Vertex3D[] = [
				mesh.vertices[i0]!.getVertex(),
				mesh.vertices[i2]!.getVertex(),
				mesh.vertices[i1]!.getVertex(),
			]
			hitObjects.push(new HitTriangle(rgv3D))
			hitObjects.push(...addedEdges.addHitEdge(i0, i1, rgv3D[0]!, rgv3D[2]!))
			hitObjects.push(...addedEdges.addHitEdge(i1, i2, rgv3D[2]!, rgv3D[1]!))
			hitObjects.push(...addedEdges.addHitEdge(i2, i0, rgv3D[1]!, rgv3D[0]!))
		}
		for (const vertex of mesh.vertices) hitObjects.push(new HitPoint(vertex.getVertex()))
		return hitObjects.map((obj) => this.setupHitObject(obj, events, table))
	}

	public getReducedMesh(mesh: Mesh, reducedVertices: number): Mesh {
		const progVertices = mesh.vertices.map((v) => new ProgMeshFloat3(v.x, v.y, v.z))
		const progIndices: ProgMeshTriData[] = []
		let i2 = 0
		for (let i = 0; i < mesh.indices.length; i += 3) {
			const t = new ProgMeshTriData([mesh.indices[i]!, mesh.indices[i + 1]!, mesh.indices[i + 2]!])
			if (t.v[0] !== t.v[1] && t.v[1] !== t.v[2] && t.v[2] !== t.v[0]) progIndices[i2++] = t
		}
		const [progMap, progPerm] = progressiveMesh(progVertices, progIndices)
		permuteVertices(progPerm, progVertices, progIndices)
		const progNewIndices: ProgMeshTriData[] = []
		remapIndices(reducedVertices, progIndices, progNewIndices, progMap)
		const reducedIndices = progNewIndices.flatMap((tri) => tri.v)
		return new Mesh(
			progVertices.map((pv) => Vertex3DNoTex2.fromArray([pv.x, pv.y, pv.z, 0, 0, 0, 0, 0])),
			reducedIndices,
		)
	}

	private setupHitObject(obj: HitObject, events: EventProxy, table: Table): HitObject {
		if (!this.data.useAsPlayfield) obj.applyPhysics(this.data, table)
		else {
			obj.setElasticity(table.data!.elasticity, table.data!.elasticityFalloff)
			obj.setFriction(table.data!.friction)
			obj.setScatter(degToRad(table.data!.scatter))
			obj.setEnabled(true)
		}
		obj.threshold = this.data.threshold
		obj.setType(CollisionType.Primitive)
		obj.obj = events
		obj.e = true
		obj.fe = this.data.hitEvent
		return obj
	}
}
