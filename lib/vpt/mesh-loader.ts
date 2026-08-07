// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Mesh } from './mesh.js'

const cache = new Map<string, Mesh>()

/** Loads a static mesh from `res/meshes/<name>.json`, cached. */
export function loadMesh(name: string): Mesh {
	let mesh = cache.get(name)
	if (!mesh) {
		let raw: string
		try {
			raw = readFileSync(`res/meshes/${name}.json`, 'utf-8') as unknown as string
			if (!raw) throw new Error('empty')
		} catch {
			const cwd =
				(globalThis as unknown as { process?: { cwd?: () => string } }).process?.cwd?.() ||
				(typeof process !== 'undefined' && (process as unknown as { cwd?: () => string }).cwd?.()) ||
				'/'
			raw = readFileSync(resolve(cwd, `res/meshes/${name}.json`), 'utf-8') as unknown as string
		}
		const json = JSON.parse(raw as string)
		mesh = Mesh.fromJson(json)
		cache.set(name, mesh)
	}
	return mesh
}
