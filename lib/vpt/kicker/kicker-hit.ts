// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { kickerHitVertices } from '../../../res/meshes/kicker-hit-mesh.js'
import { Event } from '../../game/event.js'
import type { EventProxy } from '../../game/event-proxy.js'
import type { PlayerPhysics } from '../../game/player-physics.js'
import type { CollisionEvent } from '../../physics/collision-event.js'
import { CollisionType } from '../../physics/collision-type.js'
import { STATICTIME } from '../../physics/constants.js'
import { HARD_SCATTER } from '../../physics/functions.js'
import { HitCircle } from '../../physics/hit-circle.js'
import { degToRad, FLT_MAX } from '../../util/float.js'
import { clamp } from '../../util/functions.js'
import { Vertex3D } from '../../util/math.js'
import type { Ball } from '../ball/ball.js'
import type { Table } from '../table/table.js'
import type { KickerData } from './kicker-data.js'

/** Kicker hit — captures and ejects balls. @see https://github.com/vpinball/vpinball/blob/master/kicker.cpp */
export class KickerHit extends HitCircle {
	public ball?: Ball
	public lastCapturedBall?: Ball
	private hitMesh: Vertex3D[] = []
	public declare obj: EventProxy

	constructor(
		private readonly data: KickerData,
		events: EventProxy,
		table: Table,
		radius: number,
		height: number,
	) {
		super(data.center.clone(), radius, height, height + data.hitHeight)
		if (!this.data.legacyMode) {
			const rad = this.radius * 0.8
			for (let t = 0; t < kickerHitVertices.length; t++) {
				const vPos = new Vertex3D(kickerHitVertices[t]?.x, kickerHitVertices[t]?.y, kickerHitVertices[t]?.z)
				vPos.x = vPos.x * rad + this.data.center.x
				vPos.y = vPos.y * rad + this.data.center.y
				vPos.z = vPos.z * rad * table.getScaleZ() + height
				this.hitMesh[t] = vPos
			}
		}
		this.isEnabled = this.data.isEnabled
		this.objType = CollisionType.Kicker
		this.obj = events
	}

	public override hitTest(ball: Ball, dTime: number, coll: CollisionEvent, _physics?: PlayerPhysics): number {
		return this.hitTestBasicRadius(ball, dTime, coll, false, false, false)
	}

	public override collide(coll: CollisionEvent, physics: PlayerPhysics): void {
		this.doCollide(physics, coll.ball, coll.hitNormal, coll.hitFlag, false)
	}

	public doCollide(physics: PlayerPhysics, ball: Ball, hitNormal: Vertex3D, hitBit: boolean, newBall: boolean) {
		if (this.ball) return
		const i = ball.hit.vpVolObjs.indexOf(this.obj)
		if (newBall || hitBit !== i < 0) {
			if (this.data.legacyMode || newBall)
				ball.state.pos.addAndRelease(ball.hit.vel.clone(true).multiplyScalar(STATICTIME))
			if (i < 0) {
				let hitEvent: boolean
				const grabHeight = (this.hitBBox.zlow + ball.data.radius) * this.data.hitAccuracy
				if (ball.state.pos.z < grabHeight || this.data.legacyMode || newBall) {
					hitEvent = true
				} else {
					hitEvent = false
					this.doChangeBallVelocity(ball, hitNormal)
					const length = ball.hit.vel.length()
					if (length < 0.2) ball.hit.vel.set(ball.oldVel)
					ball.oldVel.set(ball.hit.vel)
				}
				if (hitEvent) {
					if (this.data.fallThrough) {
						ball.state.isFrozen = false
					} else {
						ball.state.isFrozen = true
						ball.hit.vpVolObjs.push(this.obj!)
						this.ball = ball
						this.lastCapturedBall = ball
						if (ball === physics.activeBallBC) physics.activeBallBC = undefined
					}
					if (!newBall) this.obj.fireGroupEvent(Event.HitEventsHit)
					if (ball.state.isFrozen || this.data.fallThrough) {
						ball.hit.vel.setZero()
						ball.hit.angularMomentum.setZero()
						ball.hit.angularVelocity.setZero()
						ball.state.pos.x = this.center.x
						ball.state.pos.y = this.center.y
						if (this.data.fallThrough) ball.state.pos.z = this.hitBBox.zlow - ball.data.radius - 5
						else ball.state.pos.z = this.hitBBox.zlow + ball.data.radius
					} else {
						this.ball = undefined
					}
				}
			} else {
				ball.hit.vpVolObjs.splice(i, 1)
				this.obj.fireGroupEvent(Event.HitEventsUnhit)
			}
		}
	}

	private doChangeBallVelocity(ball: Ball, hitNormal: Vertex3D): void {
		let minDistSqr = FLT_MAX
		let idx = 3435973836
		for (let t = 0; t < this.hitMesh.length; t++) {
			const dist = ball.state.pos.clone(true).sub(this.hitMesh[t]!)
			const lengthSqr = dist.lengthSq()
			Vertex3D.release(dist)
			if (lengthSqr < minDistSqr) {
				minDistSqr = lengthSqr
				idx = t
			}
		}
		if (idx !== 3435973836) {
			const hitNorm = Vertex3D.claim(
				kickerHitVertices[idx]?.nx,
				kickerHitVertices[idx]?.ny,
				kickerHitVertices[idx]?.nz,
			)
			const dot = -ball.hit.vel.dot(hitNorm)
			const reactionImpulse = ball.data.mass * Math.abs(dot)
			const surfP = hitNormal.clone(true).multiplyScalar(-ball.data.radius)
			const surfVel = ball.hit.surfaceVelocity(surfP, true)
			const tangent = surfVel
				.clone(true)
				.subAndRelease(hitNorm.clone(true).multiplyScalar(surfVel.dot(hitNormal)))
			ball.hit.vel.addAndRelease(hitNorm.clone(true).multiplyScalar(dot))
			Vertex3D.release(hitNorm)
			const friction = 0.3
			const tangentSpSq = tangent.lengthSq()
			if (tangentSpSq > 1e-6) {
				tangent.divideScalar(Math.sqrt(tangentSpSq))
				const vt = surfVel.dot(tangent)
				const cross = Vertex3D.crossProduct(surfP, tangent, true)
				const pv1 = cross.clone(true).divideScalar(ball.hit.inertia)
				const kt = ball.hit.invMass + tangent.dotAndRelease(Vertex3D.crossProduct(pv1, surfP, true))
				const maxFriction = friction * reactionImpulse
				const jt = clamp(-vt / kt, -maxFriction, maxFriction)
				ball.hit.applySurfaceImpulseAndRelease(
					cross.clone(true).multiplyScalar(jt),
					tangent.clone(true).multiplyScalar(jt),
				)
				Vertex3D.release(cross, pv1)
			}
			Vertex3D.release(surfP, surfVel, tangent)
		}
	}

	public kickXyz(
		table: Table,
		physics: PlayerPhysics,
		angle: number,
		speed: number,
		inclination: number,
		pos: Vertex3D = new Vertex3D(),
	): void {
		if (!this.ball) return
		if (!physics.activeBallBC) physics.activeBallBC = this.ball
		if (physics.activeBallBC === this.ball) physics.bcTarget = undefined
		let angleRad = degToRad(angle)
		if (Math.abs(inclination) > Math.PI / 2) inclination *= Math.PI / 180
		let scatterAngle = this.data.scatter < 0 ? HARD_SCATTER : degToRad(this.data.scatter)
		scatterAngle *= table.getGlobalDifficulty()
		if (scatterAngle > 1e-5) {
			let scatter = Math.random() * 2 - 1
			scatter *= (1 - scatter * scatter) * 2.59808 * scatterAngle
			angleRad += scatter
		}
		const speedZ = Math.sin(inclination) * speed
		if (speedZ > 0) speed *= Math.cos(inclination)
		this.ball.hit.angularVelocity.setZero()
		this.ball.hit.angularMomentum.setZero()
		this.ball.hit.coll.hitDistance = 0
		this.ball.hit.coll.hitTime = -1
		this.ball.hit.coll.hitNormal.setZero()
		this.ball.hit.coll.hitVel.setZero()
		this.ball.hit.coll.hitFlag = false
		this.ball.hit.coll.isContact = false
		this.ball.hit.coll.hitMomentBit = true
		this.ball.state.pos.x += pos.x
		this.ball.state.pos.y += pos.y
		this.ball.state.pos.z += pos.z
		this.ball.hit.vel.x = Math.sin(angleRad) * speed
		this.ball.hit.vel.y = -Math.cos(angleRad) * speed
		this.ball.hit.vel.z = speedZ
		this.ball.state.isFrozen = false
		this.ball = undefined
	}
}
