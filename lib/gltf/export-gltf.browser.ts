// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import type { Scene } from '../refs.browser.js'
import type { TableGenerateGltfOptions } from '../vpt/table/table.js'
import type { TableExportOptions } from '../vpt/table/table-exporter.js'

export async function exportGltf(scene: Scene, _opts: TableExportOptions, gltfOpts?: TableGenerateGltfOptions) {
	const exporter = new GLTFExporter()
	const result = await exporter.parseAsync(scene, {
		binary: !!gltfOpts?.binary,
		trs: !!gltfOpts?.trs,
		onlyVisible: gltfOpts?.onlyVisible ?? true,
		animations: gltfOpts?.animations ?? [],
		maxTextureSize: Infinity,
		includeCustomExtensions: false,
	})
	return result
}
