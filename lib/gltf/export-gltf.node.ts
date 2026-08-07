// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Scene } from '../refs.node.js'
import type { TableGenerateGltfOptions } from '../vpt/table/table.js'
import type { TableExportOptions } from '../vpt/table/table-exporter.js'
import { GLTFExporter } from './gltf-exporter.js'

export function exportGltf(scene: Scene, opts: TableExportOptions, gltfOpts?: TableGenerateGltfOptions) {
	const gltfExporter = new GLTFExporter(
		Object.assign({}, { embedImages: true, optimizeImages: opts.optimizeTextures }, gltfOpts),
	)
	return gltfExporter.parse(scene)
}
