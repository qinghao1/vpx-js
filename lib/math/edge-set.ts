// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { HitLine3D } from '../physics/hit-line-3d.js'
import type { Vertex3D } from './vertex3d.js'

/**
 * This implements a set based on a number pair.
 * The order in which the numbers are provided doesn't matter because they
 * are sorted prior to checking the index.
 */
export class EdgeSet {
	private readonly edges = new Set<string>()

	public add(i: number, j: number) {
		this.edges.add(this.getKey(i, j))
	}

	public has(i: number, j: number): boolean {
		return this.edges.has(this.getKey(i, j))
	}

	public addHitEdge(i: number, j: number, vi: Vertex3D, vj: Vertex3D): HitLine3D[] {
		if (!this.has(i, j)) {
			// edge not yet added?
			this.add(i, j)
			return [new HitLine3D(vi, vj)]
		}
		return []
	}

	private getKey(i: number, j: number): string {
		return `${Math.min(i, j)},${Math.max(i, j)}`
	}
}
