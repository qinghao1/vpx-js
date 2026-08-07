import type { Scene } from '../refs.node.js'
import type { TableGenerateGltfOptions } from '../vpt/table/table'
import type { TableExportOptions } from '../vpt/table/table-exporter'
import { GLTFExporter } from './gltf-exporter'

export function exportGltf(scene: Scene, opts: TableExportOptions, gltfOpts?: TableGenerateGltfOptions) {
	const gltfExporter = new GLTFExporter(
		Object.assign({}, { embedImages: true, optimizeImages: opts.optimizeTextures }, gltfOpts),
	)
	return gltfExporter.parse(scene)
}
