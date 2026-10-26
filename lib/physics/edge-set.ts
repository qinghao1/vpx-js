// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Vertex3D } from '../math/vector.js'
import { HitLine3D } from './hit-line-3d.js'

/** Unordered pair set for mesh edges.
 * @see https://github.com/vpinball/vpinball/blob/master/src/math/Mesh.h */
export class EdgeSet {
	private readonly edges = new Set<number>()

	public add(i: number, j: number): void {
		this.edges.add(this.key(i, j))
	}

	public has(i: number, j: number): boolean {
		return this.edges.has(this.key(i, j))
	}

	/** Adds edge (i,j) if new; returns a HitLine3D for the edge. */
	public addHitEdge(i: number, j: number, vi: Vertex3D, vj: Vertex3D): HitLine3D[] {
		if (this.has(i, j)) return []
		this.add(i, j)
		return [new HitLine3D(vi, vj)]
	}

	private key(i: number, j: number): number {
		const lo = Math.min(i, j),
			hi = Math.max(i, j)
		// Undirected edge as one exact integer (safe for 32-bit indices).
		return lo * 4294967296 + hi
	}
}
