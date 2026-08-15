// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { EventProxy } from '../../game/event-proxy.js'
import { CollisionType } from '../../physics/collision-type.js'
import { HIT_SHAPE_DETAIL_LEVEL, PHYS_SKIN } from '../../physics/constants.js'
import { HitLine3D } from '../../physics/hit-line-3d.js'
import { HitLineZ } from '../../physics/hit-line-z.js'
import type { HitObject } from '../../physics/hit-object.js'
import { HitTriangle } from '../../physics/hit-triangle.js'
import { LineSeg } from '../../physics/line-seg.js'
import { Vertex2D, Vertex3D } from '../../util/vector.js'
import { Enums } from '../enums.js'
import type { Table } from '../table/table.js'
import type { RampData } from './ramp-data.js'
import type { RampMeshGenerator } from './ramp-view.js'

/** Ramp hit generator. @see https://github.com/vpinball/vpinball/blob/master/ramp.cpp */
export class RampHitGenerator {
	constructor(
		private readonly data: RampData,
		private readonly meshGenerator: RampMeshGenerator,
	) {}

	public generateHitObjects(table: Table, events: EventProxy): HitObject[] {
		const hitObjects: HitObject[] = []
		const rv = this.meshGenerator.getRampVertex(table, HIT_SHAPE_DETAIL_LEVEL, true)
		const rgvLocal = rv.rgvLocal
		const rgHeight1 = rv.ppheight
		const cVertex = rv.pcvertex
		const { wallHeightRight, wallHeightLeft } = this.getWallHeights()
		let pv1: Vertex2D
		let pv2: Vertex2D
		let pv3: Vertex2D = new Vertex2D()
		let pv4: Vertex2D = new Vertex2D()
		let rgv3D: Vertex3D[]
		let ph3dpoly: HitTriangle
		if (wallHeightRight > 0) {
			for (let i = 0; i < cVertex - 1; i++) {
				pv2 = rgvLocal[i]!
				pv3 = rgvLocal[i + 1]!
				hitObjects.push(
					...this.generateWallLineSeg(pv2, pv3, i > 0, rgHeight1[i]!, rgHeight1[i + 1]!, wallHeightRight),
				)
				hitObjects.push(
					...this.generateWallLineSeg(
						pv3,
						pv2,
						i < cVertex - 2,
						rgHeight1[i]!,
						rgHeight1[i + 1]!,
						wallHeightRight,
					),
				)
				if (i === 0) hitObjects.push(this.generateJoint2D(pv2, rgHeight1[0]!, rgHeight1[0]! + wallHeightRight))
				if (i === cVertex - 2)
					hitObjects.push(
						this.generateJoint2D(pv3, rgHeight1[cVertex - 1]!, rgHeight1[cVertex - 1]! + wallHeightRight),
					)
			}
		}
		if (wallHeightLeft > 0) {
			for (let i = 0; i < cVertex - 1; i++) {
				pv2 = rgvLocal[cVertex + i]!
				pv3 = rgvLocal[cVertex + i + 1]!
				hitObjects.push(
					...this.generateWallLineSeg(
						pv2,
						pv3,
						i > 0,
						rgHeight1[cVertex - i - 2]!,
						rgHeight1[cVertex - i - 1]!,
						wallHeightLeft,
					),
				)
				hitObjects.push(
					...this.generateWallLineSeg(
						pv3,
						pv2,
						i < cVertex - 2,
						rgHeight1[cVertex - i - 2]!,
						rgHeight1[cVertex - i - 1]!,
						wallHeightLeft,
					),
				)
				if (i === 0)
					hitObjects.push(
						this.generateJoint2D(pv2, rgHeight1[cVertex - 1]!, rgHeight1[cVertex - 1]! + wallHeightLeft),
					)
				if (i === cVertex - 2)
					hitObjects.push(this.generateJoint2D(pv3, rgHeight1[0]!, rgHeight1[0]! + wallHeightLeft))
			}
		}
		let ph3dpolyOld!: HitTriangle
		for (let i = 0; i < cVertex - 1; i++) {
			pv1 = rgvLocal[i]!
			pv2 = rgvLocal[cVertex * 2 - i - 1]!
			pv3 = rgvLocal[cVertex * 2 - i - 2]!
			pv4 = rgvLocal[i + 1]!
			rgv3D = [
				new Vertex3D(pv2.x, pv2.y, rgHeight1[i]!),
				new Vertex3D(pv1.x, pv1.y, rgHeight1[i]!),
				new Vertex3D(pv3.x, pv3.y, rgHeight1[i + 1]!),
			]
			if (i === 0) hitObjects.push(this.generateJoint(rgv3D[0]!, rgv3D[1]!))
			hitObjects.push(this.generateJoint(rgv3D[0]!, rgv3D[2]!))
			ph3dpoly = new HitTriangle(rgv3D)
			if (!ph3dpoly.isDegenerate()) {
				hitObjects.push(ph3dpoly)
				hitObjects.push(...this.checkJoint(ph3dpolyOld, ph3dpoly))
				ph3dpolyOld = ph3dpoly
			}
			rgv3D = [
				new Vertex3D(pv3.x, pv3.y, rgHeight1[i + 1]!),
				new Vertex3D(pv1.x, pv1.y, rgHeight1[i]!),
				new Vertex3D(pv4.x, pv4.y, rgHeight1[i + 1]!),
			]
			hitObjects.push(this.generateJoint(rgv3D[1]!, rgv3D[2]!))
			ph3dpoly = new HitTriangle(rgv3D)
			if (!ph3dpoly.isDegenerate()) {
				hitObjects.push(ph3dpoly)
				hitObjects.push(...this.checkJoint(ph3dpolyOld, ph3dpoly))
				ph3dpolyOld = ph3dpoly
			}
		}
		if (cVertex >= 2) {
			const v1 = new Vertex3D(pv4?.x, pv4?.y, rgHeight1[cVertex - 1]!)
			const v2 = new Vertex3D(pv3?.x, pv3?.y, rgHeight1[cVertex - 1]!)
			hitObjects.push(this.generateJoint(v1, v2))
		}
		for (let i = 0; i < cVertex - 1; i++) {
			pv1 = rgvLocal[i]!
			pv2 = rgvLocal[cVertex * 2 - i - 1]!
			pv3 = rgvLocal[cVertex * 2 - i - 2]!
			pv4 = rgvLocal[i + 1]!
			rgv3D = [
				new Vertex3D(pv1.x, pv1.y, rgHeight1[i]!),
				new Vertex3D(pv2.x, pv2.y, rgHeight1[i]!),
				new Vertex3D(pv3.x, pv3.y, rgHeight1[i + 1]!),
			]
			ph3dpoly = new HitTriangle(rgv3D)
			if (!ph3dpoly.isDegenerate()) hitObjects.push(ph3dpoly)
			rgv3D = [
				new Vertex3D(pv3.x, pv3.y, rgHeight1[i + 1]!),
				new Vertex3D(pv4.x, pv4.y, rgHeight1[i + 1]!),
				new Vertex3D(pv1.x, pv1.y, rgHeight1[i]!),
			]
			ph3dpoly = new HitTriangle(rgv3D)
			if (!ph3dpoly.isDegenerate()) hitObjects.push(ph3dpoly)
		}
		return hitObjects.map(obj => this.setupHitObject(obj, events, table))
	}

	private getWallHeights(): { wallHeightRight: number; wallHeightLeft: number } {
		switch (this.data.rampType) {
			case Enums.RampType.RampTypeFlat:
				return { wallHeightRight: this.data.rightWallHeight, wallHeightLeft: this.data.leftWallHeight }
			case Enums.RampType.RampType1Wire:
			case Enums.RampType.RampType2Wire:
				return { wallHeightRight: 31, wallHeightLeft: 31 }
			case Enums.RampType.RampType4Wire:
				return { wallHeightRight: 62, wallHeightLeft: 62 }
			case Enums.RampType.RampType3WireRight:
				return { wallHeightRight: 62, wallHeightLeft: 6 + 12.5 }
			case Enums.RampType.RampType3WireLeft:
				return { wallHeightRight: 6 + 12.5, wallHeightLeft: 62 }
			default:
				throw new Error(`Unknown ramp type "${this.data.rampType}".`)
		}
	}

	private generateWallLineSeg(
		pv1: Vertex2D,
		pv2: Vertex2D,
		pv3Exists: boolean,
		height1: number,
		height2: number,
		wallHeight: number,
	): HitObject[] {
		const hitObjects: HitObject[] = []
		if (height2 - height1 > 2 * PHYS_SKIN) {
			hitObjects.push(
				...this.generateWallLineSeg(
					pv1,
					pv1.clone().add(pv2).multiplyScalar(0.5),
					pv3Exists,
					height1,
					(height1 + height2) * 0.5,
					wallHeight,
				),
			)
			hitObjects.push(
				...this.generateWallLineSeg(
					pv1.clone().add(pv2).multiplyScalar(0.5),
					pv2,
					true,
					(height1 + height2) * 0.5,
					height2,
					wallHeight,
				),
			)
		} else {
			hitObjects.push(new LineSeg(pv1, pv2, height1, height2 + wallHeight))
			if (pv3Exists) hitObjects.push(this.generateJoint2D(pv1, height1, height2 + wallHeight))
		}
		return hitObjects
	}

	private generateJoint2D(p: Vertex2D, zLow: number, zHigh: number): HitLineZ {
		return new HitLineZ(p, zLow, zHigh)
	}

	private generateJoint(v1: Vertex3D, v2: Vertex3D): HitLine3D {
		return new HitLine3D(v1, v2)
	}

	private checkJoint(ph3d1: HitTriangle, ph3d2: HitTriangle): HitObject[] {
		if (ph3d1) {
			const jointNormal = Vertex3D.crossProduct(ph3d1.normal, ph3d2.normal)
			if (jointNormal.lengthSq() < 1e-8) return []
		}
		return [this.generateJoint(ph3d2.rgv[0]!, ph3d2.rgv[1]!)]
	}

	private setupHitObject(obj: HitObject, events: EventProxy, table: Table): HitObject {
		obj.applyPhysics(this.data, table)
		obj.threshold = this.data.threshold!
		obj.setType(CollisionType.Primitive)
		obj.obj = events
		obj.fe = this.data.hitEvent
		return obj
	}
}
