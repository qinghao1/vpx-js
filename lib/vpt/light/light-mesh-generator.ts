// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { IRenderApi } from '../../render/irender-api.js'
import type { Mesh } from '../mesh.js'
import { loadMesh } from '../mesh-loader.js'
import type { Table } from '../table/table.js'
import type { LightData } from './light-data.js'

const bulbLightMesh = loadMesh('bulb-light-mesh')
const bulbSocketMesh = loadMesh('bulb-socket-mesh')

/** Generates light meshes. @see https://github.com/vpinball/vpinball/blob/master/light.cpp */
export class LightMeshGenerator {
	constructor(private readonly data: LightData) {}
	public getMeshes<NODE, GEOMETRY, POINT_LIGHT>(
		table: Table,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
	): LightMeshes<GEOMETRY> {
		if (this.data.isBulbLight()) return this.getBulbMeshes(table)
		if (this.data.isSurfaceLight(table)) return { surfaceLight: renderApi.createLightGeometry(this.data, table) }
		return {}
	}
	private getBulbMeshes<GEOMETRY>(table: Table): LightMeshes<GEOMETRY> {
		const h =
			table.getSurfaceHeight(this.data.szSurface, this.data.center.x, this.data.center.y) * table.getScaleZ()
		const s = this.data.meshRadius,
			scZ = (v: number) => v * s * table.getScaleZ() + h
		const light = bulbLightMesh.clone('bulb.light'),
			socket = bulbSocketMesh.clone('bulb.socket')
		for (const v of light.vertices) {
			v.x = v.x * s + this.data.center.x
			v.y = v.y * s + this.data.center.y
			v.z = scZ(v.z)
		}
		for (const v of socket.vertices) {
			v.x = v.x * s + this.data.center.x
			v.y = v.y * s + this.data.center.y
			v.z = scZ(v.z)
		}
		return { light, socket }
	}
}

export interface LightMeshes<GEOMETRY> {
	surfaceLight?: GEOMETRY
	light?: Mesh
	socket?: Mesh
}
