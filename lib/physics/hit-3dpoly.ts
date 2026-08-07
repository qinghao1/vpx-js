// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Event } from '../game/event.js'
import { Vertex3D } from '../util/math.js'
import type { Ball } from '../vpt/ball/ball.js'
import type { CollisionEvent } from './collision-event.js'
import { CollisionType } from './collision-type.js'
import { C_CONTACTVEL, C_LOWNORMVEL, PHYS_TOUCH, STATICTIME } from './constants.js'
import { HitObject } from './hit-object.js'

/** 3D polygon.
 * @see https://github.com/vpinball/vpinball/blob/master/hit3dpoly.cpp */
export class Hit3DPoly extends HitObject {
	private readonly rgv: Vertex3D[]
	private readonly normal = new Vertex3D()

	constructor(rgv: Vertex3D[], objType?: CollisionType) {
		super()
		this.rgv = rgv
		if (objType) this.objType = objType
		for (let i = 0; i < rgv.length; i++) {
			const m = (i + 1) % rgv.length
			this.normal.x += (rgv[i].y - rgv[m].y) * (rgv[i].z + rgv[m].z)
			this.normal.y += (rgv[i].z - rgv[m].z) * (rgv[i].x + rgv[m].x)
			this.normal.z += (rgv[i].x - rgv[m].x) * (rgv[i].y + rgv[m].y)
		}
		const l2 = this.normal.lengthSq(),
			inv = l2 > 0 ? -1 / Math.sqrt(l2) : 0
		this.normal.multiplyScalar(inv)
		this.elasticity = 0.3
		this.setFriction(0.3)
		this.scatter = 0
	}

	public override calcHitBBox(): void {
		let l = this.rgv[0].x,
			r = l,
			t = this.rgv[0].y,
			b = t,
			zl = this.rgv[0].z,
			zh = zl
		for (let i = 1; i < this.rgv.length; i++) {
			const v = this.rgv[i]
			l = Math.min(v.x, l)
			r = Math.max(v.x, r)
			t = Math.min(v.y, t)
			b = Math.max(v.y, b)
			zl = Math.min(v.z, zl)
			zh = Math.max(v.z, zh)
		}
		this.hitBBox.left = l
		this.hitBBox.right = r
		this.hitBBox.top = t
		this.hitBBox.bottom = b
		this.hitBBox.zlow = zl
		this.hitBBox.zhigh = zh
	}

	public override collide(coll: CollisionEvent): void {
		const ball = coll.ball,
			n = coll.hitNormal
		if (this.objType !== CollisionType.Trigger) {
			const dot = -n.dot(ball.hit.vel)
			ball.hit.collide3DWall(this.normal, this.elasticity, this.elasticityFalloff, this.friction, this.scatter)
			if (this.obj?.onCollision && this.fe && dot >= this.threshold) this.obj.onCollision(this, ball, dot)
		} else {
			if (!ball.hit.isRealBall()) return
			const i = ball.hit.vpVolObjs.indexOf(this.obj!),
				hit = !coll.hitFlag === i < 0
			if (!hit) return
			ball.state.pos.addAndRelease(ball.hit.vel.clone(true).multiplyScalar(STATICTIME))
			if (i < 0) {
				ball.hit.vpVolObjs.push(this.obj!)
				this.obj!.fireGroupEvent(Event.HitEventsHit)
			} else {
				ball.hit.vpVolObjs.splice(i, 1)
				this.obj!.fireGroupEvent(Event.HitEventsUnhit)
			}
		}
	}

	public override hitTest(ball: Ball, dTime: number, coll: CollisionEvent): number {
		if (!this.isEnabled) return -1
		const bnv = this.normal.dot(ball.hit.vel)
		if (this.objType !== CollisionType.Trigger && bnv > C_LOWNORMVEL) return -1
		const r = ball.data.radius,
			nR = this.normal.clone(true).multiplyScalar(r),
			hitPos = ball.state.pos.clone(true).sub(nR),
			toBall = hitPos.clone(true).sub(this.rgv[0]),
			bnd = this.normal.dot(toBall)
		Vertex3D.release(nR, toBall)
		let bUnHit = bnv > C_LOWNORMVEL
		const inside = bnd <= 0,
			rigid = this.objType !== CollisionType.Trigger
		let hitTime: number
		if (rigid) {
			if (bnd < -r) {
				Vertex3D.release(hitPos)
				return -1
			}
			if (bnd <= PHYS_TOUCH)
				hitTime = inside || Math.abs(bnv) > C_CONTACTVEL || bnd <= -PHYS_TOUCH ? 0 : bnd * (0.5 / PHYS_TOUCH) + 0.5
			else if (Math.abs(bnv) > C_LOWNORMVEL) hitTime = bnd / -bnv
			else {
				Vertex3D.release(hitPos)
				return -1
			}
		} else {
			if (bnv * bnd >= 0) {
				if (!ball.hit.isRealBall() || Math.abs(bnd) >= r * 0.5 || inside !== ball.hit.vpVolObjs.includes(this.obj!)) {
					Vertex3D.release(hitPos)
					return -1
				}
				hitTime = 0
				bUnHit = !inside
			} else hitTime = bnd / -bnv
		}
		if (!isFinite(hitTime) || hitTime < 0 || hitTime > dTime) {
			Vertex3D.release(hitPos)
			return -1
		}
		hitPos.addAndRelease(ball.hit.vel.clone(true).multiplyScalar(hitTime))
		let x2 = this.rgv[0].x,
			y2 = this.rgv[0].y,
			hx2 = hitPos.x >= x2,
			hy2 = hitPos.y <= y2,
			cross = 0
		for (let i = 0; i < this.rgv.length; i++) {
			const x1 = x2,
				y1 = y2,
				hx1 = hx2,
				hy1 = hy2,
				j = (i + 1) % this.rgv.length
			x2 = this.rgv[j].x
			y2 = this.rgv[j].y
			hx2 = hitPos.x >= x2
			hy2 = hitPos.y <= y2
			if (y1 === y2 || (hy1 && hy2) || (!hy1 && !hy2) || (hx1 && hx2)) continue
			if (!hx1 && !hx2) {
				cross ^= 1
				continue
			}
			if (x2 === x1) {
				if (!hx2) cross ^= 1
				continue
			}
			if (x2 - ((y2 - hitPos.y) * (x1 - x2)) / (y1 - y2) > hitPos.x) cross ^= 1
		}
		Vertex3D.release(hitPos)
		if (!(cross & 1)) return -1
		coll.hitNormal.set(this.normal)
		if (!rigid) coll.hitFlag = bUnHit
		coll.hitDistance = bnd
		return hitTime
	}
}
