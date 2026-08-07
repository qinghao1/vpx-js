// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { exportGltf, Scene } from '../../refs.node.js'
import type { MeshConvertOptions } from '../../render/irender-api.js'
import { ThreeRenderApi } from '../../render/threejs/three-render-api.js'
import type { Table, TableGenerateOptions } from './table.js'
import { TableMeshGenerator } from './table-mesh-generator.js'

export /** TableExporter. */
class TableExporter {
	private readonly table: Table
	private readonly meshGenerator: TableMeshGenerator

	constructor(table: Table) {
		this.table = table
		this.meshGenerator = new TableMeshGenerator(table)
	}

	// public async exportGltf(): Promise<string> {
	// 	this.opts.gltfOptions!.binary = false;
	// 	return JSON.stringify(await this.export<any>());
	// }

	public async exportGlb(opts: TableExportOptions = {}): Promise<Buffer> {
		opts = Object.assign({}, defaultOptions, opts)
		opts.gltfOptions!.binary = true
		return await this.export<Buffer>(opts)
	}

	private async export<T>(opts: TableExportOptions): Promise<T> {
		// we always use Three.js for GLTF generation
		const renderApi = new ThreeRenderApi(opts)
		const playfieldGroup = this.meshGenerator.generateTableNode(renderApi, opts)

		const scene = new Scene()
		scene.name = 'table'
		scene.add(playfieldGroup)

		// now, export to GLTF
		return exportGltf(scene, opts, opts.gltfOptions)
	}
}

export interface TableExportOptions extends TableGenerateOptions, MeshConvertOptions {}

const defaultOptions: TableExportOptions = {
	applyMaterials: true,
	optimizeTextures: false,
	exportPlayfield: true,
	exportPrimitives: true,
	exportRubbers: true,
	exportSurfaces: true,
	exportFlippers: true,
	exportBumpers: true,
	exportRamps: true,
	exportPlayfieldLights: false,
	exportLightBulbs: true,
	exportLightBulbLights: true,
	exportHitTargets: true,
	exportGates: true,
	exportKickers: true,
	exportTriggers: true,
	exportSpinners: true,
	exportPlungers: true,
	gltfOptions: {},
}
