// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { PlayerPhysics } from '../game/player-physics.js'
import type { Ball } from '../vpt/ball/ball.js'
import type { CollisionEvent } from './collision-event.js'
import { CollisionType } from './collision-type.js'
import type { Hit3DPoly } from './hit-3dpoly.js'
import { HitCircle } from './hit-circle.js'
import { HitKDNode } from './hit-kd-node.js'
import { HitLine3D } from './hit-line-3d.js'
import { HitLineZ } from './hit-line-z.js'
import { HitKind, type HitObject } from './hit-object.js'
import { HitPlane } from './hit-plane.js'
import { HitPoint } from './hit-point.js'
import { HitTriangle } from './hit-triangle.js'
import { LineSeg } from './line-seg.js'
import { getWasmKernels, isWasmReady, warmWasmPools } from './wasm/kernels.js'

const isBatchCircle = (h: HitObject): boolean =>
	h.hitKind === HitKind.Circle && h.hitTest === HitCircle.prototype.hitTest
const isBatchLineSeg = (h: HitObject): boolean =>
	h.hitKind === HitKind.LineSeg && h.hitTest === LineSeg.prototype.hitTest

// Ball-ball KD vs brute cutoff — empirical sweep (Node 24, heavy table 58k hitObjects):
//  empty 10 balls: thr0 0.024ms thr8 0.018 thr16 0.013 thr32 0.012 thr64 0.011
//  heavy 5 total: thr0 1.66 p95 2.24 thr16 1.47 p95 4.0 thr32 1.28 p95 2.16
//  heavy 9 total: thr0 6.03 p95 7.7 thr16 5.77 p95 7.9 thr32 8.73 p95 12.8 thr64 9.26
// 16 balances multiball (most common) vs large empty stress;
// above it the KD tree amortizes for >16 balls, below it brute avoids rebuild/traversal.
const BRUTE_FORCE_THRESHOLD = 16

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

	constructor() {
		this.rootNode = new HitKDNode(this)
	}

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

	public fillFromVector(vho: HitObject[], warm = false): void {
		this.init(vho)
		this.rootNode.rectBounds.clear()
		this.rootNode.start = 0
		this.rootNode.items = this.numItems
		for (let i = 0; i < this.numItems; i++) {
			const h = vho[i]!
			h.calcHitBBox()
			this.rootNode.rectBounds.extend(h.hitBBox)
			this.orgIdx[i] = i
		}
		this.rootNode.createNextLevel(0, 0)
		if (warm) this.warmPools(vho)
	}

	private warmPools(vho: HitObject[]): void {
		let circleCount = 0,
			planeCount = 0,
			lineZCount = 0,
			pointCount = 0,
			triangleCount = 0,
			lineSegCount = 0,
			line3DCount = 0,
			polyCount = 0
		for (const h of vho) {
			if (isBatchCircle(h)) circleCount++
			else if (h.hitKind === HitKind.Plane) planeCount++
			else if (h.hitKind === HitKind.LineZ) lineZCount++
			else if (h.hitKind === HitKind.Point) pointCount++
			else if (h.hitKind === HitKind.Triangle) triangleCount++
			else if (h.hitKind === HitKind.Line3D) line3DCount++
			else if (
				h.hitKind === HitKind.Poly &&
				(h as Hit3DPoly).objType !== CollisionType.Trigger &&
				(h as Hit3DPoly).rgv.length <= 32
			)
				polyCount++
			else if (isBatchLineSeg(h)) lineSegCount++
		}
		if (
			circleCount ||
			planeCount ||
			lineZCount ||
			pointCount ||
			triangleCount ||
			lineSegCount ||
			line3DCount ||
			polyCount
		) {
			if (isWasmReady())
				warmWasmPools(
					circleCount,
					planeCount,
					lineZCount,
					pointCount,
					triangleCount,
					lineSegCount,
					line3DCount,
					polyCount,
				)
			else
				void getWasmKernels().then(() =>
					warmWasmPools(
						circleCount,
						planeCount,
						lineZCount,
						pointCount,
						triangleCount,
						lineSegCount,
						line3DCount,
						polyCount,
					),
				)
		}
	}

	public update(): void {
		if (this.numItems <= BRUTE_FORCE_THRESHOLD) {
			for (const h of this.orgVho) h.calcHitBBox()
			return
		}
		this.fillFromVector(this.orgVho)
	}
	public finalize(): void {
		this.tmp = []
	}
	public hitTestBall(ball: Ball, c: CollisionEvent, p: PlayerPhysics): void {
		if (this.numItems === 0) return
		if (this.numItems <= BRUTE_FORCE_THRESHOLD) {
			for (const h of this.orgVho) {
				if (h === ball.hit || !h.isEnabled) continue
				if (!h.hitBBox.intersectRect(ball.hit.hitBBox)) continue
				if (!h.hitBBox.intersectSphere(ball.state.pos, ball.hit.rcHitRadiusSqr)) continue
				h.doHitTest(ball, c, p)
			}
			return
		}
		this.rootNode.hitTestBall(ball, c, p)
	}
	public getItemAt(i: number): HitObject {
		return this.orgVho[this.orgIdx[i]!]!
	}
	public allocTwoNodes(): HitKDNode[] {
		if (this.numNodes + 1 >= this.nodes.length) return []
		const idx = this.numNodes
		this.numNodes += 2
		return [this.nodes[idx]!, this.nodes[idx + 1]!]
	}
}
