// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { PlayerPhysics } from '../game/player-physics.js'
import type { Ball } from '../vpt/ball/ball.js'
import type { CollisionEvent } from './collision-event.js'
import { HitKDNode } from './hit-kd-node.js'
import type { HitObject } from './hit-object.js'
import { getWasmKernels, isWasmReady, warmWasmPools } from './wasm/kernels.js'
import { HitCircle } from './hit-circle.js'
import { HitPlane } from './hit-plane.js'
import { HitLineZ } from './hit-line-z.js'
import { HitLine3D } from './hit-line-3d.js'

const isBatchCircle = (h: HitObject): boolean => h instanceof HitCircle && h.hitTest === HitCircle.prototype.hitTest

/** @see https://github.com/vpinball/vpinball/blob/master/kdtree.cpp */
export class HitKD {
	public orgIdx: number[] = []
	private rootNode: HitKDNode
	private numItems = 0
	private maxItems = 0
	private orgVho: HitObject[] = []
	public tmp: number[] = []
	private nodes: HitKDNode[] = []
	public numNodes = 0

	constructor() { this.rootNode = new HitKDNode(this) }

	public init(vho: HitObject[]): void {
		this.orgVho = vho
		this.numItems = vho.length
		if (this.numItems > this.maxItems) {
			this.maxItems = this.numItems
			this.orgIdx = new Array(this.numItems)
			this.tmp = new Array(this.numItems)
			this.nodes = new Array((this.numItems * 2 + 1) & ~1 || 2)
			for (let i = 0; i < this.nodes.length; i++) this.nodes[i] = new HitKDNode(this)
		}
		if (!this.tmp.length && this.maxItems) this.tmp = new Array(this.maxItems)
		this.numNodes = 0
		this.rootNode.reset(this)
	}

	public fillFromVector(vho: HitObject[]): void {
		this.init(vho)
		this.rootNode.rectBounds.Clear()
		this.rootNode.start = 0
		this.rootNode.items = this.numItems
		for (let i = 0; i < this.numItems; i++) {
			const h = vho[i]!
			h.calcHitBBox()
			this.rootNode.rectBounds.extend(h.hitBBox)
			this.orgIdx[i] = i
		}
		this.rootNode.createNextLevel(0, 0)
		const warm = () => {
			let c = 0, p = 0, l = 0
			for (const h of vho) {
				if (isBatchCircle(h)) c++
				else if (h instanceof HitPlane) p++
				else if (h instanceof HitLineZ && !(h instanceof HitLine3D)) l++
			}
			if (c || p || l) warmWasmPools(c, p, l)
		}
		if (isWasmReady()) warm()
		else void getWasmKernels().then(warm)
	}

	public update(): void { this.fillFromVector(this.orgVho) }
	public finalize(): void { this.tmp = [] }
	public hitTestBall(ball: Ball, c: CollisionEvent, p: PlayerPhysics): void { this.rootNode.hitTestBall(ball, c, p) }
	public getItemAt(i: number): HitObject { return this.orgVho[this.orgIdx[i]!]! }
	public allocTwoNodes(): HitKDNode[] {
		if (this.numNodes + 1 >= this.nodes.length) return []
		this.numNodes += 2
		return this.nodes.slice(this.numNodes - 2)
	}
}
