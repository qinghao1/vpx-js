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

	private numItems: number = 0
	private maxItems: number = 0

	private orgVho: HitObject[] = []

	public tmp: number[] = []

	private nodes: HitKDNode[] = []
	public numNodes: number = 0

	constructor() {
		this.rootNode = new HitKDNode(this)
	}

	public init(vho: HitObject[]) {
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

		for (let i = 0; i < this.numItems; ++i) {
			const pho = vho[i]
			pho.calcHitBBox() //!! omit, as already calced?!
			this.rootNode.rectBounds.extend(pho.hitBBox)
			this.orgIdx[i] = i
		}

		this.rootNode.createNextLevel(0, 0)
	}

	// call when the bounding boxes of the HitObjects have changed to update the tree
	public update(): void {
		this.fillFromVector(this.orgVho)
	}

	// call when finalizing a tree (no dynamic changes planned on it)
	public finalize(): void {
		this.tmp = []
	}

	public hitTestBall(ball: Ball, collision: CollisionEvent, physics: PlayerPhysics) {
		this.rootNode.hitTestBall(ball, collision, physics)
	}

	// public hitTestXRay(pball: Ball, pvhoHit: HitObject[], coll: CollisionEvent, player: Player) {
	// 	this.rootNode.hitTestXRay(pball, pvhoHit, coll, player);
	// }

	public getItemAt(i: number): HitObject {
		return this.orgVho[this.orgIdx[i]]
	}

	/* istanbul ignore next: never executed below the "magic" check (https://www.vpforums.org/index.php?showtopic=42690) */
	public allocTwoNodes(): HitKDNode[] {
		if (this.numNodes + 1 >= this.nodes.length) {
			// space for two more nodes?
			return []
		} else {
			this.numNodes += 2
			return this.nodes.slice(this.numNodes - 2)
		}
	}
}
