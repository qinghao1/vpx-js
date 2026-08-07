// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { degToRad, f4 } from '../../math/float.js'
import { Matrix3D } from '../../math/matrix3d.js'
import { Vertex3D } from '../../math/vertex3d.js'
import { logger } from '../../util/logger.js'
import { Enums } from '../enums.js'
import { Mesh } from '../mesh.js'
import type { Table } from '../table/table.js'
import type { TriggerData } from './trigger-data.js'

const require = createRequire(import.meta.url)

const triggerButtonMeshJson = JSON.parse(
	readFileSync(resolve(process.cwd(), 'res/meshes/trigger-button-mesh.json'), 'utf-8'),
)
const triggerSimpleMeshJson = JSON.parse(
	readFileSync(resolve(process.cwd(), 'res/meshes/trigger-simple-mesh.json'), 'utf-8'),
)
const triggerStarMeshJson = JSON.parse(
	readFileSync(resolve(process.cwd(), 'res/meshes/trigger-star-mesh.json'), 'utf-8'),
)
const triggerDWireMeshJson = JSON.parse(
	readFileSync(resolve(process.cwd(), 'res/meshes/trigger-wire-d-mesh.json'), 'utf-8'),
)

const triggerButtonMesh = Mesh.fromJson(triggerButtonMeshJson)
const triggerSimpleMesh = Mesh.fromJson(triggerSimpleMeshJson)
const triggerStarMesh = Mesh.fromJson(triggerStarMeshJson)
const triggerDWireMesh = Mesh.fromJson(triggerDWireMeshJson)

export /** TriggerMeshGenerator. */
class TriggerMeshGenerator {
	private readonly data: TriggerData

	constructor(data: TriggerData) {
		this.data = data
	}

	public getMesh(table: Table): Mesh {
		const baseHeight =
			table.getSurfaceHeight(this.data.szSurface, this.data.center.x, this.data.center.y) * table.getScaleZ()

		let zOffset = this.data.shape === Enums.TriggerShape.TriggerButton ? 5.0 : 0.0
		if (this.data.shape === Enums.TriggerShape.TriggerWireC) {
			zOffset = -19.0
		}

		const fullMatrix = new Matrix3D()
		if (this.data.shape === Enums.TriggerShape.TriggerWireB) {
			const tempMatrix = new Matrix3D()
			fullMatrix.rotateXMatrix(degToRad(-23.0))
			tempMatrix.rotateZMatrix(degToRad(this.data.rotation))
			fullMatrix.multiply(tempMatrix)
		} else if (this.data.shape === Enums.TriggerShape.TriggerWireC) {
			const tempMatrix = new Matrix3D()
			fullMatrix.rotateXMatrix(degToRad(140.0))
			tempMatrix.rotateZMatrix(degToRad(this.data.rotation))
			fullMatrix.multiply(tempMatrix)
		} else {
			fullMatrix.rotateZMatrix(degToRad(this.data.rotation))
		}

		const mesh = this.getBaseMesh()
		for (const vertex of mesh.vertices) {
			const vert = Vertex3D.claim(vertex.x, vertex.y, vertex.z).multiplyMatrix(fullMatrix)
			//fullMatrix.multiplyVector(vert);

			if (this.data.shape === Enums.TriggerShape.TriggerButton || this.data.shape === Enums.TriggerShape.TriggerStar) {
				vertex.x = f4(vert.x * this.data.radius) + this.data.center.x
				vertex.y = f4(vert.y * this.data.radius) + this.data.center.y
				vertex.z = f4(f4(f4(vert.z * this.data.radius) * table.getScaleZ()) + baseHeight) + zOffset
			} else {
				vertex.x = f4(vert.x * this.data.scaleX) + this.data.center.x
				vertex.y = f4(vert.y * this.data.scaleY) + this.data.center.y
				vertex.z = f4(f4(vert.z * table.getScaleZ()) + baseHeight) + zOffset
			}

			const normal = Vertex3D.claim(vertex.nx, vertex.ny, vertex.nz).multiplyMatrixNoTranslate(fullMatrix)
			vertex.nx = normal.x
			vertex.ny = normal.y
			vertex.nz = normal.z

			Vertex3D.release(vert, normal)
		}
		return mesh
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
			case Enums.TriggerShape.TriggerButton:
				return triggerButtonMesh.clone(name)
			case Enums.TriggerShape.TriggerStar:
				return triggerStarMesh.clone(name)
			case Enums.TriggerShape.TriggerNone:
				return triggerSimpleMesh.clone(name)
			/* istanbul ignore next */
			default:
				logger().warn('[TriggerItem.getBaseMesh] Unknown shape "%s".', this.data.shape)
				return triggerSimpleMesh.clone(name)
		}
	}
}
