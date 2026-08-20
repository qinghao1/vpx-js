// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BufferAttribute, BufferGeometry, Float32BufferAttribute } from 'three'
import type { Mesh } from '../../vpt/mesh.js'

export class ThreeMeshGenerator {
	public convertToBufferGeometry(mesh: Mesh): BufferGeometry {
		const vc = mesh.vertices.length
		const ic = mesh.indices.length
		if (!vc) {
			const emptyBg = new BufferGeometry()
			emptyBg.name = mesh.name
			emptyBg.setAttribute('position', new Float32BufferAttribute([], 3))
			emptyBg.setAttribute('normal', new Float32BufferAttribute([], 3))
			emptyBg.setAttribute('uv', new Float32BufferAttribute([], 2))
			return emptyBg
		}
		const bg = new BufferGeometry()
		bg.name = mesh.name
		const positions = new Float32Array(vc * 3)
		const normals = new Float32Array(vc * 3)
		const uvs = new Float32Array(vc * 2)
		let hasNormal = false
		for (let i = 0; i < vc; i++) {
			const v = mesh.vertices[i]
			if (!v) continue
			const o3 = i * 3
			positions[o3] = v.x
			positions[o3 + 1] = v.y
			positions[o3 + 2] = v.z
			normals[o3] = v.nx
			normals[o3 + 1] = v.ny
			normals[o3 + 2] = v.nz
			if (v.nx || v.ny || v.nz) hasNormal = true
			const o2 = i * 2
			uvs[o2] = v.tu
			uvs[o2 + 1] = 1 - v.tv
		}
		bg.setAttribute('position', new Float32BufferAttribute(positions, 3))
		if (ic) {
			const IndexArray = vc > 65535 ? Uint32Array : Uint16Array
			bg.setIndex(new BufferAttribute(new IndexArray(mesh.indices), 1))
		}
		if (hasNormal) bg.setAttribute('normal', new Float32BufferAttribute(normals, 3))
		else bg.computeVertexNormals()
		bg.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
		return bg
	}
}

export function releaseGeometry(geometry: BufferGeometry): void {
	geometry.dispose()
	;(geometry as unknown as { disposeBoundsTree?: () => void }).disposeBoundsTree?.()
}
