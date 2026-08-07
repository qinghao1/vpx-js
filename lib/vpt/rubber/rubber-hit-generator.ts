// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { EventProxy } from '../../game/event-proxy.js'
import { CollisionType } from '../../physics/collision-type.js'
import type { HitObject } from '../../physics/hit-object.js'
import { HitPoint } from '../../physics/hit-point.js'
import { HitTriangle } from '../../physics/hit-triangle.js'
import { EdgeSet } from '../../util/edge-set.js'
import { Vertex3D } from '../../util/math.js'
import type { Mesh } from '../mesh.js'
import type { Table } from '../table/table.js'
import type { RubberData } from './rubber-data.js'
import type { RubberMeshGenerator } from './rubber-mesh-generator.js'

/** Generates rubber hit shapes. @see https://github.com/vpinball/vpinball/blob/master/rubber.cpp */
export class RubberHitGenerator {
	constructor(
		private readonly data: RubberData,
		private readonly meshGenerator: RubberMeshGenerator,
	) {}

	public generateHitObjects(events: EventProxy, table: Table): HitObject[] {
		const addedEdges = new EdgeSet()
		const mesh = this.meshGenerator.getMeshes(table, 6, true)
		const hits: HitObject[] = []
		for (let i = 0; i < mesh.indices.length; i += 3) {
			const a = mesh.vertices[mesh.indices[i]!]!,
				b = mesh.vertices[mesh.indices[i + 2]!]!,
				c = mesh.vertices[mesh.indices[i + 1]!]!
			hits.push(
				new HitTriangle([new Vertex3D(a.x, a.y, a.z), new Vertex3D(b.x, b.y, b.z), new Vertex3D(c.x, c.y, c.z)]),
			)
			hits.push(...RubberHitGenerator.edge(mesh, addedEdges, mesh.indices[i]!, mesh.indices[i + 2]!))
			hits.push(...RubberHitGenerator.edge(mesh, addedEdges, mesh.indices[i + 2]!, mesh.indices[i + 1]!))
			hits.push(...RubberHitGenerator.edge(mesh, addedEdges, mesh.indices[i + 1]!, mesh.indices[i]!))
		}
		for (const mv of mesh.vertices) hits.push(new HitPoint(new Vertex3D(mv.x, mv.y, mv.z)))
		return hits.map((o) => this.setup(o, events, table))
	}

	private setup(obj: HitObject, events: EventProxy, table: Table): HitObject {
		obj.applyPhysics(this.data, table)
		obj.setType(CollisionType.Primitive)
		obj.threshold = 2
		obj.obj = events
		obj.fe = this.data.hitEvent
		return obj
	}

	private static edge(mesh: Mesh, edges: EdgeSet, i: number, j: number): HitObject[] {
		const a = mesh.vertices[i]!,
			b = mesh.vertices[j]!
		return edges.addHitEdge(i, j, new Vertex3D(a.x, a.y, a.z), new Vertex3D(b.x, b.y, b.z))
	}
}
