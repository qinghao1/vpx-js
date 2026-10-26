// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { MathUtils } from 'three'
import { Event } from '../../game/event.js'
import type { EventProxy } from '../../game/event-proxy.js'
import type { IAnimation } from '../../game/interfaces.js'
import { Matrix3D } from '../../math/matrix.js'
import { Vertex3D } from '../../math/vector.js'
import { CollisionType } from '../../physics/collision-type.js'
import { EdgeSet } from '../../physics/edge-set.js'
import type { HitObject } from '../../physics/hit-object.js'
import { HitPoint } from '../../physics/hit-point.js'
import { HitTriangle } from '../../physics/hit-triangle.js'
import { Enums } from '../enums.js'
import type { Mesh } from '../mesh.js'
import type { Table } from '../table/table.js'
import type { HitTargetData, HitTargetState } from './hit-target.js'
import type { HitTargetMeshGenerator } from './hit-target-view.js'

export const DROP_TARGET_LIMIT = 52.0

/** HitTarget animation. @see https://github.com/vpinball/vpinball/blob/master/hittarget.cpp */
export class HitTargetAnimation implements IAnimation {
	public timeStamp = 0
	public hitEvent = false
	public moveDown = true
	public moveAnimation = false
	private timeMsec = 0

	constructor(
		private readonly data: HitTargetData,
		private readonly state: HitTargetState,
		private readonly events: EventProxy,
	) {}

	public init(timeMsec: number): void {
		this.timeMsec = timeMsec
	}

	public updateAnimation(newTimeMsec: number, table: Table): boolean {
		const oldTimeMsec = Math.min(this.timeMsec, newTimeMsec)
		this.timeMsec = newTimeMsec
		// Do not animate invisible targets: old tables rely on hidden drop targets never dropping.
		if (!this.data.isVisible) return false
		const diffTimeMsec = newTimeMsec - oldTimeMsec
		const prevZOffset = this.state.zOffset
		const prevXRotation = this.state.xRotation
		if (this.hitEvent) {
			if (!this.data.isDropped) this.moveDown = true
			this.moveAnimation = true
			this.hitEvent = false
		}
		if (this.data.isDropTarget()) {
			if (this.moveAnimation) {
				let step = this.data.dropSpeed * table.getScaleZ()
				const limit = DROP_TARGET_LIMIT * table.getScaleZ()
				if (this.moveDown) step = -step
				else if (this.timeMsec - this.timeStamp < this.data.raiseDelay) step = 0
				this.state.zOffset += step * diffTimeMsec
				if (this.moveDown) {
					if (this.state.zOffset <= -limit) {
						this.state.zOffset = -limit
						this.moveDown = false
						this.data.isDropped = true
						this.moveAnimation = false
						this.timeStamp = 0
						if (this.data.useHitEvent) this.events.fireGroupEvent(Event.TargetEventsDropped)
					}
				} else {
					if (this.state.zOffset >= 0) {
						this.state.zOffset = 0
						this.moveAnimation = false
						this.data.isDropped = false
						if (this.data.useHitEvent) this.events.fireGroupEvent(Event.TargetEventsRaised)
					}
				}
				this.events.fireGroupEvent(Event.AnimateEventsAnimate)
			}
		} else {
			if (this.moveAnimation) {
				let step = this.data.dropSpeed * table.getScaleZ()
				const limit = 13 * table.getScaleZ()
				if (!this.moveDown) step = -step
				this.state.xRotation += step * diffTimeMsec
				if (this.moveDown) {
					if (this.state.xRotation >= limit) {
						this.state.xRotation = limit
						this.moveDown = false
					}
				} else {
					if (this.state.xRotation <= 0) {
						this.state.xRotation = 0
						this.moveAnimation = false
					}
				}
				this.events.fireGroupEvent(Event.AnimateEventsAnimate)
			}
		}
		return this.state.zOffset !== prevZOffset || this.state.xRotation !== prevXRotation
	}
}

const dropTargetHitPlaneVertices: Vertex3D[] = [
	new Vertex3D(-0.3, 0.001737, -0.160074),
	new Vertex3D(-0.3, 0.001738, 0.439926),
	new Vertex3D(0.3, 0.001738, 0.439926),
	new Vertex3D(0.3, 0.001737, -0.160074),
	new Vertex3D(-0.5, 0.001738, 0.439926),
	new Vertex3D(-0.5, 0.001738, 1.789926),
	new Vertex3D(0.5, 0.001738, 1.789926),
	new Vertex3D(0.5, 0.001738, 0.439926),
	new Vertex3D(-0.535355, 0.001738, 0.45457),
	new Vertex3D(-0.535355, 0.001738, 1.775281),
	new Vertex3D(-0.55, 0.001738, 0.489926),
	new Vertex3D(-0.55, 0.001738, 1.739926),
	new Vertex3D(0.535355, 0.001738, 0.45457),
	new Vertex3D(0.535355, 0.001738, 1.775281),
	new Vertex3D(0.55, 0.001738, 0.489926),
	new Vertex3D(0.55, 0.001738, 1.739926),
]

const dropTargetHitPlaneIndices: number[] = [
	0, 1, 2, 2, 3, 0, 1, 4, 5, 6, 7, 2, 5, 6, 1, 2, 1, 6, 4, 8, 9, 9, 5, 4, 8, 10, 11, 11, 9, 8, 6, 12, 7, 12, 6, 13,
	12, 13, 14, 13, 15, 14,
]

/** HitTarget hit generator. @see https://github.com/vpinball/vpinball/blob/master/hittarget.cpp */
export class HitTargetHitGenerator {
	constructor(
		private readonly data: HitTargetData,
		private readonly meshGenerator: HitTargetMeshGenerator,
	) {}

	public generateHitObjects(events: EventProxy, table: Table): HitObject[] {
		return this.data.isDropTarget()
			? this.generateDropTargetHits(events, table)
			: this.generateHitTargetHits(events, table)
	}

	private generateDropTargetHits(events: EventProxy, table: Table): HitObject[] {
		const addedEdges = new EdgeSet()
		const hitMesh = this.meshGenerator.generateMesh(table)
		const hitObjects = this.generateCollidables(hitMesh, addedEdges, this.data.legacy, events, table)
		const fullMatrix = new Matrix3D().rotateZMatrix(MathUtils.degToRad(this.data.rotZ))
		if (!this.data.legacy) {
			const rgv3D: Vertex3D[] = []
			let hitShapeOffset = 0.18
			if (this.data.targetType === Enums.TargetType.DropTargetBeveled) hitShapeOffset = 0.25
			if (this.data.targetType === Enums.TargetType.DropTargetFlatSimple) hitShapeOffset = 0.13
			const tableHeight = table.getTableHeight()
			const scaleZ = table.getScaleZ()
			for (const planeVertex of dropTargetHitPlaneVertices) {
				const vert = new Vertex3D(
					planeVertex.x * this.data.vSize.x,
					(planeVertex.y + hitShapeOffset) * this.data.vSize.y,
					planeVertex.z * this.data.vSize.z,
				).multiplyMatrix(fullMatrix)
				rgv3D.push(
					new Vertex3D(
						vert.x + this.data.position.x,
						vert.y + this.data.position.y,
						vert.z * scaleZ + this.data.position.z + tableHeight,
					),
				)
			}
			for (let i = 0; i < dropTargetHitPlaneIndices.length; i += 3) {
				const i0 = dropTargetHitPlaneIndices[i]!
				const i1 = dropTargetHitPlaneIndices[i + 1]!
				const i2 = dropTargetHitPlaneIndices[i + 2]!
				const rgv3D2: Vertex3D[] = [rgv3D[i0]!, rgv3D[i2]!, rgv3D[i1]!]
				hitObjects.push(this.setupHitObject(new HitTriangle(rgv3D2), events, true, table))
				hitObjects.push(
					...this.triangleEdges(addedEdges, i0, i1, i2, rgv3D2).map(obj =>
						this.setupHitObject(obj, events, true, table),
					),
				)
			}
			for (let i = 0; i < dropTargetHitPlaneVertices.length; ++i) {
				hitObjects.push(this.setupHitObject(new HitPoint(rgv3D[i]!), events, true, table))
			}
		}
		return hitObjects
	}

	private generateHitTargetHits(events: EventProxy, table: Table): HitObject[] {
		const addedEdges = new EdgeSet()
		const hitMesh = this.meshGenerator.generateMesh(table)
		return this.generateCollidables(hitMesh, addedEdges, true, events, table)
	}

	private generateCollidables(
		hitMesh: Mesh,
		addedEdges: EdgeSet,
		setHitObject: boolean,
		events: EventProxy,
		table: Table,
	): HitObject[] {
		const hitObjects: HitObject[] = []
		for (let i = 0; i < hitMesh.indices.length; i += 3) {
			const i0 = hitMesh.indices[i]!
			const i1 = hitMesh.indices[i + 1]!
			const i2 = hitMesh.indices[i + 2]!
			const rgv3D: Vertex3D[] = [
				new Vertex3D(hitMesh.vertices[i0]?.x, hitMesh.vertices[i0]?.y, hitMesh.vertices[i0]?.z),
				new Vertex3D(hitMesh.vertices[i2]?.x, hitMesh.vertices[i2]?.y, hitMesh.vertices[i2]?.z),
				new Vertex3D(hitMesh.vertices[i1]?.x, hitMesh.vertices[i1]?.y, hitMesh.vertices[i1]?.z),
			]
			hitObjects.push(this.setupHitObject(new HitTriangle(rgv3D), events, setHitObject, table))
			hitObjects.push(
				...this.triangleEdges(addedEdges, i0, i1, i2, rgv3D).map(obj =>
					this.setupHitObject(obj, events, setHitObject, table),
				),
			)
		}
		for (const vertex of hitMesh.vertices) {
			hitObjects.push(this.setupHitObject(new HitPoint(vertex.getVertex()), events, setHitObject, table))
		}
		return hitObjects
	}

	private triangleEdges(addedEdges: EdgeSet, i0: number, i1: number, i2: number, verts: Vertex3D[]) {
		return [
			...addedEdges.addHitEdge(i0, i1, verts[0]!, verts[2]!),
			...addedEdges.addHitEdge(i1, i2, verts[2]!, verts[1]!),
			...addedEdges.addHitEdge(i2, i0, verts[1]!, verts[0]!),
		]
	}

	private setupHitObject(obj: HitObject, events: EventProxy, setHitObject: boolean, table: Table): HitObject {
		obj.applyPhysics(this.data, table)
		obj.threshold = this.data.threshold
		obj.setType(CollisionType.HitTarget)
		obj.obj = events
		obj.fe = setHitObject && this.data.useHitEvent
		return obj
	}
}
