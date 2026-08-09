// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { Scene } from '../../refs.node.js'
import type { MeshConvertOptions } from '../../render/irender-api.js'
import { ensureNodeCanvasPolyfill } from '../../render/threejs/node-canvas-polyfill.js'
import { ThreeRenderApi } from '../../render/threejs/three-render-api.js'
import type { Table, TableGenerateOptions } from './table.js'
import { TableMeshGenerator } from './table-mesh-generator.js'

/** Exports a table to GLTF/GLB. */
export class TableExporter {
	private readonly table: Table
	private readonly meshGenerator: TableMeshGenerator

	constructor(table: Table) {
		this.table = table
		this.meshGenerator = new TableMeshGenerator(table)
	}

	public async exportGlb(opts: TableExportOptions = {}): Promise<Buffer> {
		opts = Object.assign({}, defaultOptions, opts)
		opts.gltfOptions!.binary = true
		return await this.export<Buffer>(opts)
	}

	private async export<T>(opts: TableExportOptions): Promise<T> {
		const renderApi = new ThreeRenderApi(opts)
		const playfieldGroup = this.meshGenerator.generateTableNode(renderApi, opts)

		const scene = new Scene()
		scene.name = 'table'
		scene.add(playfieldGroup)

		if (typeof document === 'undefined') ensureNodeCanvasPolyfill()
		const exporter = new GLTFExporter()
		const result = await exporter.parseAsync(scene, {
			binary: !!opts.gltfOptions?.binary,
			trs: !!opts.gltfOptions?.trs,
			onlyVisible: opts.gltfOptions?.onlyVisible ?? true,
			animations: opts.gltfOptions?.animations ?? [],
			maxTextureSize: opts.gltfOptions?.maxTextureSize ?? Infinity,
			includeCustomExtensions: !!opts.gltfOptions?.includeCustomExtensions,
		})
		if (result instanceof ArrayBuffer) return Buffer.from(result) as unknown as T
		return result as unknown as T
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
