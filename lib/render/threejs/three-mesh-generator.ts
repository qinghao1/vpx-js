// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BufferAttribute, BufferGeometry, type ExtrudeGeometry, Float32BufferAttribute, Vector2 } from 'three'
import type { Mesh } from '../../vpt/mesh.js'

const ZERO_SIDE_UV = new Vector2(0, 0)
const ZERO_SIDE_UVS = [ZERO_SIDE_UV, ZERO_SIDE_UV, ZERO_SIDE_UV, ZERO_SIDE_UV]

/**
 * ExtrudeGeometry UVs in playfield space: top faces map vertex (x, y) through
 * the inverse dimensions, side walls collapse to zero. Shared by the playfield
 * and light-insert generators.
 */
export function playfieldUvGenerator(invW: number, invH: number, originX = 0, originY = 0) {
	return {
		generateSideWallUV(): Vector2[] {
			return ZERO_SIDE_UVS
		},
		generateTopUV(_g: ExtrudeGeometry, vertices: number[], a: number, b: number, c: number): Vector2[] {
			const ax = vertices[a * 3]
			const ay = vertices[a * 3 + 1]
			const bx = vertices[b * 3]
			const by = vertices[b * 3 + 1]
			const cx = vertices[c * 3]
			const cy = vertices[c * 3 + 1]
			return [
				new Vector2((ax - originX) * invW, 1 - (ay - originY) * invH),
				new Vector2((bx - originX) * invW, 1 - (by - originY) * invH),
				new Vector2((cx - originX) * invW, 1 - (cy - originY) * invH),
			]
		},
	}
}

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
			// Normals mirror with the winding (three.js negated them at shade
			// time under BackSide — see negateOnBackSide — while FrontSide uses
			// them as-is, so the stored values flip too).
			normals[o3] = -v.nx
			normals[o3 + 1] = -v.ny
			normals[o3 + 2] = -v.nz
			if (v.nx || v.ny || v.nz) hasNormal = true
			const o2 = i * 2
			uvs[o2] = v.tu
			// VPX v counts from the texture top, WebGL from the bottom.
			uvs[o2 + 1] = 1 - v.tv
		}
		bg.setAttribute('position', new Float32BufferAttribute(positions, 3))
		if (ic) {
			const IndexArray = vc > 65535 ? Uint32Array : Uint16Array
			// VPX table space projects mirrored on screen (the scene-root rotateX
			// turns table +z away from the top-down camera), so stored triplets are
			// CW and FrontSide would cull them: store each triplet reversed to
			// restore CCW fronts.
			const reversed = new IndexArray(ic)
			for (let t = 0; t + 2 < ic; t += 3) {
				reversed[t] = mesh.indices[t]!
				reversed[t + 1] = mesh.indices[t + 2]!
				reversed[t + 2] = mesh.indices[t + 1]!
			}
			for (let t = ic - (ic % 3); t < ic; t++) reversed[t] = mesh.indices[t]!
			bg.setIndex(new BufferAttribute(reversed, 1))
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
