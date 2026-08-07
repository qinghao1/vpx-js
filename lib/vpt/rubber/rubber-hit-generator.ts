// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { EventProxy } from '../../game/event-proxy.js'
import { EdgeSet } from '../../math/edge-set.js'
import { Vertex3D } from '../../math/vertex3d.js'
import { CollisionType } from '../../physics/collision-type.js'
import type { HitObject } from '../../physics/hit-object.js'
import { HitPoint } from '../../physics/hit-point.js'
import { HitTriangle } from '../../physics/hit-triangle.js'
import type { Mesh } from '../mesh.js'
import type { Table } from '../table/table.js'
import type { RubberData } from './rubber-data.js'
import type { RubberMeshGenerator } from './rubber-mesh-generator.js'

export /** Rubber hit generator. */
class RubberHitGenerator {
	private readonly data: RubberData
	private readonly meshGenerator: RubberMeshGenerator

	constructor(data: RubberData, meshGenerator: RubberMeshGenerator) {
		this.data = data
		this.meshGenerator = meshGenerator
	}

	public generateHitObjects(events: EventProxy, table: Table): HitObject[] {
		const hitObjects: HitObject[] = []
		const addedEdges: EdgeSet = new EdgeSet()
		const mesh = this.meshGenerator.getMeshes(table, 6, true) //!! adapt hacky code in the function if changing the "6" here

		// add collision triangles and edges
		for (let i = 0; i < mesh.indices.length; i += 3) {
			const rgv3D: Vertex3D[] = []
			// NB: HitTriangle wants CCW vertices, but for rendering we have them in CW order
			let v = mesh.vertices[mesh.indices[i]]
			rgv3D[0] = new Vertex3D(v.x, v.y, v.z)
			v = mesh.vertices[mesh.indices[i + 2]]
			rgv3D[1] = new Vertex3D(v.x, v.y, v.z)
			v = mesh.vertices[mesh.indices[i + 1]]
			rgv3D[2] = new Vertex3D(v.x, v.y, v.z)
			hitObjects.push(new HitTriangle(rgv3D))

			hitObjects.push(...RubberHitGenerator.generateHitEdge(mesh, addedEdges, mesh.indices[i], mesh.indices[i + 2]))
			hitObjects.push(...RubberHitGenerator.generateHitEdge(mesh, addedEdges, mesh.indices[i + 2], mesh.indices[i + 1]))
			hitObjects.push(...RubberHitGenerator.generateHitEdge(mesh, addedEdges, mesh.indices[i + 1], mesh.indices[i]))
		}

		// add collision vertices
		for (const mv of mesh.vertices) {
			const v = new Vertex3D(mv.x, mv.y, mv.z)
			hitObjects.push(new HitPoint(v))
		}
		return hitObjects.map((obj) => this.setupHitObject(obj, events, table))
	}

	private setupHitObject(obj: HitObject, events: EventProxy, table: Table): HitObject {
		obj.applyPhysics(this.data, table)

		// the rubber is of type ePrimitive for triggering the event in HitTriangle::Collide()
		obj.setType(CollisionType.Primitive)
		// hard coded threshold for now
		obj.threshold = 2.0
		obj.obj = events
		obj.fe = this.data.hitEvent
		return obj
	}

	private static generateHitEdge(mesh: Mesh, addedEdges: EdgeSet, i: number, j: number): HitObject[] {
		const v1 = new Vertex3D(mesh.vertices[i].x, mesh.vertices[i].y, mesh.vertices[i].z)
		const v2 = new Vertex3D(mesh.vertices[j].x, mesh.vertices[j].y, mesh.vertices[j].z)
		return addedEdges.addHitEdge(i, j, v1, v2)
	}
}
