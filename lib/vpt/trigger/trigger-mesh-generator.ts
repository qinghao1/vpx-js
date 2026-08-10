// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { MathUtils } from 'three'

import { logger } from '../../util/logger.js'
import { Matrix3D } from '../../util/matrix.js'
import { Vertex3D } from '../../util/vector.js'
import { Enums } from '../enums.js'
import type { Mesh } from '../mesh.js'
import { loadMesh } from '../mesh-loader.js'
import type { Table } from '../table/table.js'
import type { TriggerData } from './trigger-data.js'

const triggerButtonMesh = loadMesh('trigger-button-mesh')
const triggerSimpleMesh = loadMesh('trigger-simple-mesh')
const triggerStarMesh = loadMesh('trigger-star-mesh')
const triggerDWireMesh = loadMesh('trigger-wire-d-mesh')
const triggerInderMesh = loadMesh('trigger-inder-mesh')

/** Generates trigger mesh. @see https://github.com/vpinball/vpinball/blob/master/trigger.cpp */
export class TriggerMeshGenerator {
	private readonly data: TriggerData
	constructor(data: TriggerData) {
		this.data = data
	}

	public getMesh(table: Table): Mesh {
		const baseHeight =
			table.getSurfaceHeight(this.data.szSurface, this.data.center.x, this.data.center.y) * table.getScaleZ()
		const zOffset = this.getZOffset()
		const fullMatrix = this.getFullMatrix()
		const mesh = this.getBaseMesh()
		const isRound =
			this.data.shape === Enums.TriggerShape.TriggerButton || this.data.shape === Enums.TriggerShape.TriggerStar
		for (const v of mesh.vertices) {
			const vert = Vertex3D.claim(v.x, v.y, v.z).multiplyMatrix(fullMatrix)
			if (isRound) {
				v.x = vert.x * this.data.radius + this.data.center.x
				v.y = vert.y * this.data.radius + this.data.center.y
				v.z = vert.z * this.data.radius * table.getScaleZ() + baseHeight + zOffset
			} else {
				v.x = vert.x * this.data.scaleX + this.data.center.x
				v.y = vert.y * this.data.scaleY + this.data.center.y
				v.z = vert.z * table.getScaleZ() + baseHeight + zOffset
			}
			const n = Vertex3D.claim(v.nx, v.ny, v.nz).multiplyMatrixNoTranslate(fullMatrix)
			v.nx = n.x
			v.ny = n.y
			v.nz = n.z
			Vertex3D.release(vert, n)
		}
		return mesh
	}

	private getZOffset(): number {
		if (this.data.shape === Enums.TriggerShape.TriggerWireC) return -19
		if (this.data.shape === Enums.TriggerShape.TriggerButton) return 5
		return 0
	}

	private getFullMatrix(): Matrix3D {
		const m = new Matrix3D()
		if (this.data.shape === Enums.TriggerShape.TriggerWireB) {
			m.rotateZMatrix(MathUtils.degToRad(this.data.rotation))
			const tmp = new Matrix3D().rotateXMatrix(MathUtils.degToRad(-23))
			m.multiply(tmp)
		} else if (this.data.shape === Enums.TriggerShape.TriggerWireC) {
			m.rotateZMatrix(MathUtils.degToRad(this.data.rotation))
			const tmp = new Matrix3D().rotateXMatrix(MathUtils.degToRad(140))
			m.multiply(tmp)
		} else {
			m.rotateZMatrix(MathUtils.degToRad(this.data.rotation))
		}
		return m
	}

	private getBaseMesh(): Mesh {
		const name = `trigger-${this.data.getName()}`
		switch (this.data.shape) {
			case Enums.TriggerShape.TriggerWireA:
			case Enums.TriggerShape.TriggerWireB:
			case Enums.TriggerShape.TriggerWireC:
				return triggerSimpleMesh.clone(name)
			case Enums.TriggerShape.TriggerWireD:
				return triggerDWireMesh.clone(name)
			case Enums.TriggerShape.TriggerInder:
				return triggerInderMesh.clone(name)
			case Enums.TriggerShape.TriggerButton:
				return triggerButtonMesh.clone(name)
			case Enums.TriggerShape.TriggerStar:
				return triggerStarMesh.clone(name)
			case Enums.TriggerShape.TriggerNone:
				return triggerSimpleMesh.clone(name)
			default:
				logger().warn('[TriggerMeshGenerator] Unknown shape "%s".', this.data.shape)
				return triggerSimpleMesh.clone(name)
		}
	}
}
