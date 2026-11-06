// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Storage } from '../../io/ole-doc.js'
import { degToRad } from '../../math/angle.js'
import { Matrix3D } from '../../math/matrix.js'
import type { Vertex2D } from '../../math/vector.js'
import type { Meshes } from '../../render/irender-api.js'
import { Item } from '../item.js'
import type { Table } from '../table/table.js'
import { FlipperData } from './flipper-data.js'
import { FlipperMesh } from './flipper-mesh.js'
import { FlipperState } from './flipper-state.js'
import { FlipperUpdater } from './flipper-updater.js'

/** @see https://github.com/vpinball/vpinball/blob/master/flipper.cpp */
export class Flipper extends Item<FlipperData> {
	private readonly mesh: FlipperMesh
	private readonly state: FlipperState
	private readonly updater: FlipperUpdater

	public static async fromStorage(storage: Storage, itemName: string): Promise<Flipper> {
		const data = await FlipperData.fromStorage(storage, itemName)
		return new Flipper(data)
	}

	public constructor(data: FlipperData) {
		super(data)
		this.mesh = new FlipperMesh()
		this.state = FlipperState.claim(
			this.getName(),
			degToRad(this.data.startAngle),
			this.data.center.clone(),
			this.data.isVisible,
			this.data.szMaterial!,
			this.data.szImage!,
			this.data.szRubberMaterial!,
		)
		this.updater = new FlipperUpdater(this.data, this.state)
	}

	public getState(): FlipperState {
		return this.state
	}

	public getMeshes<GEOMETRY>(table: Table): Meshes<GEOMETRY> {
		const meshes: Meshes<GEOMETRY> = {}
		const matrix = this.getMatrix().toRightHanded()
		const flipper = this.mesh.generateMeshes(this.data, table)
		meshes.base = {
			isVisible: this.data.isVisible,
			mesh: flipper.base.transform(matrix),
			material: table.getMaterial(this.data.szMaterial),
			map: table.getTexture(this.data.szImage),
		}
		if (flipper.rubber) {
			meshes.rubber = {
				isVisible: this.data.isVisible,
				mesh: flipper.rubber.transform(matrix),
				material: table.getMaterial(this.data.szRubberMaterial),
			}
		}
		return meshes
	}

	private getMatrix(rotation: number = this.data.startAngle): Matrix3D {
		const trafoMatrix = new Matrix3D().setTranslation(this.data.center.x, this.data.center.y, 0)
		const rotMatrix = new Matrix3D().rotateZMatrix(degToRad(rotation))
		rotMatrix.multiply(trafoMatrix)
		return rotMatrix
	}

	public getUpdater(): FlipperUpdater {
		return this.updater
	}
}

export interface FlipperConfig {
	center: Vertex2D
	baseRadius: number
	endRadius: number
	flipperRadius: number
	angleStart: number
	angleEnd: number
	zLow: number
	zHigh: number
}
