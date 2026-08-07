// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { PlayerPhysics } from '../game/player-physics.js'
import type { Ball } from '../vpt/ball/ball.js'
import type { CollisionEvent } from './collision-event.js'
import { HitKDNode } from './hit-kd-node.js'
import type { HitObject } from './hit-object.js'

/** KD-tree for dynamic hit objects. */
export class HitKD {
	public orgIdx: number[] = []
	private rootNode: HitKDNode
	private numItems = 0
	private maxItems = 0
	private orgVho: HitObject[] = []
	public tmp: number[] = []
	private nodes: HitKDNode[] = []
	public numNodes = 0

	constructor() {
		this.rootNode = new HitKDNode(this)
	}

	public init(vho: HitObject[]): void {
		this.orgVho = vho
		this.numItems = vho.length
		if (this.numItems > this.maxItems) {
			this.maxItems = this.numItems
			this.orgIdx = []
			this.tmp = []
			this.nodes = []
		}
		this.numNodes = 0
		this.rootNode.reset(this)
	}

	public fillFromVector(vho: HitObject[]): void {
		this.init(vho)
		this.rootNode.rectBounds.Clear()
		this.rootNode.start = 0
		this.rootNode.items = this.numItems
		for (let i = 0; i < this.numItems; i++) {
			const pho = vho[i]
			pho.calcHitBBox()
			this.rootNode.rectBounds.extend(pho.hitBBox)
			this.orgIdx[i] = i
		}
		this.rootNode.createNextLevel(0, 0)
	}

	public update(): void {
		this.fillFromVector(this.orgVho)
	}

	public finalize(): void {
		this.tmp = []
	}

	public hitTestBall(ball: Ball, collision: CollisionEvent, physics: PlayerPhysics): void {
		this.rootNode.hitTestBall(ball, collision, physics)
	}

	public getItemAt(i: number): HitObject {
		return this.orgVho[this.orgIdx[i]]
	}

	/* istanbul ignore next */
	public allocTwoNodes(): HitKDNode[] {
		if (this.numNodes + 1 >= this.nodes.length) return []
		this.numNodes += 2
		return this.nodes.slice(this.numNodes - 2)
	}
}
