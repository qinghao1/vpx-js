// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { HitLine3D } from '../physics/hit-line-3d.js'
import type { Vertex3D } from './vector.js'

/** Unordered pair set for mesh edges.
 * @see https://github.com/vpinball/vpinball/blob/master/mesh.h */
export class EdgeSet {
	private readonly edges = new Set<string>()

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

	private key(i: number, j: number): string {
		return `${Math.min(i, j)},${Math.max(i, j)}`
	}
}
