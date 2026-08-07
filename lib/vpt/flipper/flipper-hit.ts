// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Event } from '../../game/event.js'
import type { EventProxy } from '../../game/event-proxy.js'
import type { PlayerPhysics } from '../../game/player-physics.js'
import type { CollisionEvent } from '../../physics/collision-event.js'
import {
	C_CONTACTVEL,
	C_DISP_GAIN,
	C_DISP_LIMIT,
	C_EMBEDDED,
	C_EMBEDSHOT,
	C_INTERATIONS,
	C_LOWNORMVEL,
	C_PRECISION,
	C_TOL_ENDPNTS,
	PHYS_TOUCH,
} from '../../physics/constants.js'
import { elasticityWithFalloff } from '../../physics/functions.js'
import { HitObject } from '../../physics/hit-object.js'
import { degToRad } from '../../util/float.js'
import { FRect3D } from '../../util/frect3d.js'
import { clamp } from '../../util/functions.js'
import { Vertex2D, Vertex3D } from '../../util/math.js'
import type { Ball } from '../ball/ball.js'
import type { Table } from '../table/table.js'
import type { TableData } from '../table/table-data.js'
import type { FlipperConfig } from './flipper.js'
import type { FlipperData } from './flipper-data.js'
import { FlipperMover } from './flipper-mover.js'
import type { FlipperState } from './flipper-state.js'

/** Flipper collision — face/end/center.
 * @see https://github.com/vpinball/vpinball/blob/master/flipper.cpp */
export class FlipperHit extends HitObject {
	private readonly mover: FlipperMover
	private readonly data: FlipperData
	private readonly state: FlipperState
	private readonly tableData: TableData
	private readonly events: EventProxy
	private lastHitTime = 0

	public static getInstance(
		data: FlipperData,
		state: FlipperState,
		events: EventProxy,
		physics: PlayerPhysics,
		table: Table,
	): FlipperHit {
		data.updatePhysicsSettings(table)
		const h = table.getSurfaceHeight(data.szSurface, data.center.x, data.center.y)
		if (data.flipperRadiusMin > 0 && data.flipperRadiusMax > data.flipperRadiusMin) {
			data.flipperRadius = data.flipperRadiusMax - (data.flipperRadiusMax - data.flipperRadiusMin)
			data.flipperRadius = Math.max(data.flipperRadius, data.baseRadius - data.endRadius + 0.05)
		} else data.flipperRadius = data.flipperRadiusMax
		return new FlipperHit(
			{
				center: data.center,
				baseRadius: Math.max(data.baseRadius, 0.01),
				endRadius: Math.max(data.endRadius, 0.01),
				flipperRadius: Math.max(data.flipperRadius, 0.01),
				angleStart: degToRad(data.startAngle),
				angleEnd: degToRad(data.endAngle),
				zLow: h,
				zHigh: h + data.height,
			},
			data,
			state,
			events,
			physics,
			table.data!,
		)
	}

	constructor(
		config: FlipperConfig,
		data: FlipperData,
		state: FlipperState,
		events: EventProxy,
		physics: PlayerPhysics,
		tableData: TableData,
	) {
		super()
		this.events = events
		this.mover = new FlipperMover(config, data, state, events, physics, tableData)
		this.data = data
		this.state = state
		this.tableData = tableData
		this.updatePhysicsFromFlipper()
	}

	public calcHitBBox(): void {
		const c = this.mover.hitCircleBase.center,
			r = this.mover.flipperRadius + this.mover.endRadius + 0.1
		this.hitBBox = new FRect3D(
			c.x - r,
			c.x + r,
			c.y - r,
			c.y + r,
			this.mover.hitCircleBase.hitBBox.zlow,
			this.mover.hitCircleBase.hitBBox.zhigh,
		)
	}

	public hitTest(ball: Ball, dTime: number, coll: CollisionEvent): number {
		if (!this.data.isEnabled) return -1
		const last = this.mover.lastHitFace
		let t = this.hitTestFlipperFace(ball, dTime, coll, last)
		if (t >= 0) return t
		t = this.hitTestFlipperFace(ball, dTime, coll, !last)
		if (t >= 0) {
			this.mover.lastHitFace = !last
			return t
		}
		t = this.hitTestFlipperEnd(ball, dTime, coll)
		if (t >= 0) return t
		t = this.mover.hitCircleBase.hitTest(ball, dTime, coll)
		if (t >= 0) {
			coll.hitVel.set(0, 0)
			coll.hitMomentBit = true
			return t
		}
		return -1
	}

	public contact(coll: CollisionEvent, dTime: number, physics: PlayerPhysics): void {
		const ball = coll.ball,
			n = coll.hitNormal
		if (coll.hitDistance < -C_EMBEDDED) ball.hit.vel.addAndRelease(n.clone(true).multiplyScalar(0.1))
		const vRel = Vertex3D.claim(),
			rB = Vertex3D.claim(),
			rF = Vertex3D.claim()
		this.getRelativeVelocity(n, ball, vRel, rB, rF)
		const normVel = vRel.dot(n)
		if (normVel <= C_CONTACTVEL) {
			const aB = ball.hit.surfaceAcceleration(rB, physics, true),
				aF = this.mover.surfaceAcceleration(rF, true),
				aRel = aB.clone(true).sub(aF)
			const nDeriv = Vertex3D.crossZ(this.mover.angleSpeed, n, true),
				normAcc = aRel.dot(n) + 2 * nDeriv.dot(vRel)
			Vertex3D.release(nDeriv, aF, aB)
			if (normAcc < 0) {
				const aBc = n.clone(true).multiplyScalar(ball.hit.invMass),
					pv2 = n.clone(true).multiplyScalar(-1)
				const cross = Vertex3D.crossProduct(rF, pv2, true),
					pv1 = cross.clone(true).divideScalar(this.mover.inertia),
					aFc = Vertex3D.crossProduct(pv1, rF, true)
				const contactAcc = n.dotAndRelease(aBc.clone(true).sub(aFc))
				const j = -normAcc / contactAcc
				ball.hit.vel.addAndRelease(
					n.clone(true).multiplyScalar(j * dTime * ball.hit.invMass - coll.hitOrgNormalVelocity),
				)
				this.mover.applyImpulseAndRelease(cross.clone(true).multiplyScalar(j * dTime))
				Vertex3D.release(aBc, aFc, cross, pv1, pv2)
				const slip = vRel.clone(true).subAndRelease(n.clone(true).multiplyScalar(normVel)),
					maxF = j * this.friction,
					slipSpeed = slip.length()
				let slipDir: Vertex3D, crossF: Vertex3D, numer: number, denomF: number, pv13: Vertex3D
				if (slipSpeed < C_PRECISION) {
					const slipAcc = aRel.clone(true).subAndRelease(n.clone(true).multiplyScalar(aRel.dot(n)))
					if (slipAcc.lengthSq() < 1e-6) {
						Vertex3D.release(aRel, vRel, rB, rF, slip, slipAcc)
						return
					}
					slipDir = slipAcc.normalize()
					numer = -slipDir.dot(aRel)
					crossF = Vertex3D.crossProduct(rF, slipDir, true)
					pv13 = crossF.clone(true).divideScalar(-this.mover.inertia)
					denomF = slipDir.dotAndRelease(Vertex3D.crossProduct(pv13, rF, true))
				} else {
					slipDir = slip.clone(true).divideScalar(slipSpeed)
					numer = -slipDir.dot(vRel)
					crossF = Vertex3D.crossProduct(rF, slipDir, true)
					pv13 = crossF.clone(true).divideScalar(this.mover.inertia)
					denomF = slipDir.dotAndRelease(Vertex3D.crossProduct(pv13, rF, true))
				}
				Vertex3D.release(aRel, vRel, rF, slip, pv13)
				const crossB = Vertex3D.crossProduct(rB, slipDir, true),
					pv12 = crossB.clone(true).divideScalar(ball.hit.inertia)
				const denomB = ball.hit.invMass + slipDir.dotAndRelease(Vertex3D.crossProduct(pv12, rB, true))
				const friction = clamp(numer / (denomB + denomF), -maxF, maxF)
				Vertex3D.release(rB, pv12)
				ball.hit.applySurfaceImpulseAndRelease(
					crossB.clone(true).multiplyScalar(dTime * friction),
					slipDir.clone(true).multiplyScalar(dTime * friction),
				)
				this.mover.applyImpulseAndRelease(crossF.clone(true).multiplyScalar(-dTime * friction))
				Vertex3D.release(crossF, slipDir, crossB)
				return
			}
			Vertex3D.release(aRel)
		}
		Vertex3D.release(vRel, rB, rF)
	}

	public collide(coll: CollisionEvent, physics: PlayerPhysics): void {
		const ball = coll.ball,
			n = coll.hitNormal
		const vRel = Vertex3D.claim(),
			rB = Vertex3D.claim(),
			rF = Vertex3D.claim()
		this.getRelativeVelocity(n, ball, vRel, rB, rF)
		let bnv = n.dot(vRel)
		if (bnv >= -C_LOWNORMVEL) {
			if (bnv > C_LOWNORMVEL) {
				Vertex3D.release(vRel, rB, rF)
				return
			}
			if (coll.hitDistance < -C_EMBEDDED) bnv = -C_EMBEDSHOT
			else {
				Vertex3D.release(vRel, rB, rF)
				return
			}
		}
		physics.activeBallBC = ball
		let hdist = -C_DISP_GAIN * coll.hitDistance
		if (hdist > 1e-4) {
			if (hdist > C_DISP_LIMIT) hdist = C_DISP_LIMIT
			ball.state.pos.addAndRelease(coll.hitNormal.clone(true).multiplyScalar(hdist))
		}
		const angResp = Vertex3D.crossProduct(rF, n, true)
		const angImp = -angResp.z
		let scale = 1
		if (this.mover.isInContact && this.mover.contactTorque! * angImp >= 0) {
			angResp.setZero()
			scale = 0.5
		}
		const eps = elasticityWithFalloff(this.elasticity, this.elasticityFalloff, bnv)
		const pv1 = angResp.clone(true).divideScalar(this.mover.inertia)
		let impulse = (-(1 + eps) * bnv) / (ball.hit.invMass + n.dotAndRelease(Vertex3D.crossProduct(pv1, rF, true)))
		const flipImp = n.clone(true).multiplyScalar(-(impulse * scale))
		Vertex3D.release(angResp, pv1)
		const rotI = Vertex3D.crossProduct(rF, flipImp, true)
		if (this.mover.isInContact && rotI.z * this.mover.contactTorque! < 0) {
			const recoil = -rotI.z / this.mover.contactTorque!,
				bnvAfter = bnv + impulse * ball.hit.invMass
			if (recoil <= 0.5 || bnvAfter > 0) {
				impulse = -(1 + eps) * bnv * ball.data.mass
				flipImp.setZero()
				rotI.setZero()
			}
		}
		Vertex3D.release(flipImp)
		ball.hit.vel.addAndRelease(n.clone(true).multiplyScalar(impulse * ball.hit.invMass))
		this.mover.applyImpulseAndRelease(rotI)
		const tangent = vRel.clone(true).subAndRelease(n.clone(true).multiplyScalar(vRel.dot(n))),
			tSq = tangent.lengthSq()
		if (tSq > 1e-6) {
			tangent.divideScalar(Math.sqrt(tSq))
			const vt = vRel.dot(tangent)
			const crossB = Vertex3D.crossProduct(rB, tangent, true),
				pv12 = crossB.clone(true).divideScalar(ball.hit.inertia)
			let kt = ball.hit.invMass + tangent.dotAndRelease(Vertex3D.crossProduct(pv12, rB, true))
			const crossF = Vertex3D.crossProduct(rF, tangent, true),
				pv13 = crossF.clone(true).divideScalar(this.mover.inertia)
			kt += tangent.dotAndRelease(Vertex3D.crossProduct(pv13, rF, true))
			const maxF = this.friction * impulse,
				jt = clamp(-vt / kt, -maxF, maxF)
			ball.hit.applySurfaceImpulseAndRelease(
				crossB.clone(true).multiplyScalar(jt),
				tangent.clone(true).multiplyScalar(jt),
			)
			this.mover.applyImpulseAndRelease(crossF.clone(true).multiplyScalar(-jt))
			Vertex3D.release(crossB, pv12, crossF, pv13)
		}
		Vertex3D.release(vRel, rB, rF, tangent)
		if (bnv < -0.25 && physics.timeMsec - this.lastHitTime > 250) {
			const h = coll.hitMomentBit ? -1 : -bnv
			if (h < 0) this.events.fireGroupEvent(Event.HitEventsHit)
			else this.events.fireVoidEventParm(Event.FlipperEventsCollide, h)
		}
		this.lastHitTime = physics.timeMsec
	}

	public getMoverObject(): FlipperMover {
		return this.mover
	}

	public updatePhysicsFromFlipper(): void {
		const td = this.tableData
		const useOverride = !!(this.data.overridePhysics || (td.overridePhysicsFlipper && td.overridePhysics))
		this.elasticityFalloff = useOverride
			? (this.data.overrideElasticityFalloff ?? this.data.elasticityFalloff!)
			: this.data.elasticityFalloff!
		this.elasticity = useOverride ? (this.data.overrideElasticity ?? this.data.elasticity!) : this.data.elasticity!
		this.setFriction(useOverride ? (this.data.overrideFriction ?? this.data.friction!) : this.data.friction!)
		this.scatter = degToRad(useOverride ? (this.data.overrideScatterAngle ?? this.data.scatter!) : this.data.scatter!)
	}

	public hitTestFlipperFace(ball: Ball, dTime: number, coll: CollisionEvent, face1: boolean): number {
		const angleCur = this.state.angle,
			angleSpeed = this.mover.angleSpeed,
			base = this.mover.hitCircleBase.center,
			feR = this.mover.endRadius
		const angleMin = Math.min(this.mover.angleStart, this.mover.angleEnd),
			angleMax = Math.max(this.mover.angleStart, this.mover.angleEnd)
		const ballR = ball.data.radius,
			bvX = ball.hit.vel.x,
			bvY = ball.hit.vel.y
		let ffnx = this.mover.zeroAngNorm.x
		if (face1) ffnx = -ffnx
		const ffny = this.mover.zeroAngNorm.y
		const vp = Vertex2D.claim(this.mover.hitCircleBase.radius * ffnx, this.mover.hitCircleBase.radius * ffny)
		const faceN = Vertex2D.claim()
		let bffnd = 0,
			bvtx = 0,
			bvty = 0,
			contactAng = 0,
			t = 0,
			t0 = 0,
			t1 = 0,
			d0 = 0,
			d1 = 0,
			dp = 0,
			k = 0
		for (k = 1; k <= C_INTERATIONS; ++k) {
			contactAng = angleCur + angleSpeed * t
			if (contactAng >= angleMax) contactAng = angleMax
			else if (contactAng <= angleMin) contactAng = angleMin
			const s = Math.sin(contactAng),
				c = Math.cos(contactAng)
			faceN.x = ffnx * c - ffny * s
			faceN.y = ffny * c + ffnx * s
			const vt = Vertex2D.claim(vp.x * c - vp.y * s + base.x, vp.y * c + vp.x * s + base.y)
			bvtx = ball.state.pos.x + bvX * t - vt.x
			bvty = ball.state.pos.y + bvY * t - vt.y
			Vertex2D.release(vt)
			bffnd = bvtx * faceN.x + bvty * faceN.y - ballR
			if (Math.abs(bffnd) <= C_PRECISION) break
			if (k === 1) {
				if (bffnd < -(ballR + feR)) {
					Vertex2D.release(faceN, vp)
					return -1
				}
				if (bffnd <= PHYS_TOUCH) break
				t0 = t1 = dTime
				d0 = 0
				d1 = bffnd
			} else if (k === 2) {
				if (dp * bffnd > 0) {
					Vertex2D.release(faceN, vp)
					return -1
				}
				t0 = 0
				t1 = dTime
				d0 = dp
				d1 = bffnd
			} else {
				if (bffnd * d0 <= 0) {
					t1 = t
					d1 = bffnd
					if (dp * bffnd > 0) d0 *= 0.5
				} else {
					t0 = t
					d0 = bffnd
					if (dp * bffnd > 0) d1 *= 0.5
				}
			}
			t = t0 - (d0 * (t1 - t0)) / (d1 - d0)
			dp = bffnd
		}
		Vertex2D.release(vp)
		if (!isFinite(t) || t < 0 || t > dTime || (k > C_INTERATIONS && Math.abs(bffnd) > ballR * 0.25)) {
			Vertex2D.release(faceN)
			return -1
		}
		const tang = Vertex2D.claim()
		if (face1) {
			tang.x = -faceN.y
			tang.y = faceN.x
		} else {
			tang.x = faceN.y
			tang.y = -faceN.x
		}
		const bfftd = bvtx * tang.x + bvty * tang.y
		Vertex2D.release(tang)
		const len = this.mover.flipperRadius * this.mover.zeroAngNorm.x
		if (bfftd < -C_TOL_ENDPNTS || bfftd > len + C_TOL_ENDPNTS) {
			Vertex2D.release(faceN)
			return -1
		}
		const hitz = ball.state.pos.z + ball.hit.vel.z * t
		if (hitz + ballR * 0.5 < this.hitBBox.zlow || hitz - ballR * 0.5 > this.hitBBox.zhigh) {
			Vertex2D.release(faceN)
			return -1
		}
		coll.hitNormal.set(faceN.x, faceN.y, 0)
		const dist = Vertex2D.claim(
			ball.state.pos.x + bvX * t - ballR * faceN.x - base.x,
			ball.state.pos.y + bvY * t - ballR * faceN.y - base.y,
		)
		Vertex2D.release(faceN)
		const d = Math.sqrt(dist.x * dist.x + dist.y * dist.y),
			inv = 1 / d
		coll.hitVel.set(-dist.y * inv, dist.x * inv)
		Vertex2D.release(dist)
		let asp = angleSpeed
		if ((contactAng >= angleMax && asp > 0) || (contactAng <= angleMin && asp < 0)) asp = 0
		coll.hitMomentBit = d === 0
		const dv = Vertex2D.claim(bvX - coll.hitVel!.x * asp * d, bvY - coll.hitVel!.y * asp * d)
		const bnv = dv.x * coll.hitNormal.x + dv.y * coll.hitNormal.y
		Vertex2D.release(dv)
		if (Math.abs(bnv) <= C_CONTACTVEL && bffnd <= PHYS_TOUCH) {
			coll.isContact = true
			coll.hitOrgNormalVelocity = bnv
		} else if (bnv > C_LOWNORMVEL) return -1
		coll.hitDistance = bffnd
		return t
	}

	private getRelativeVelocity(n: Vertex3D, ball: Ball, vRel: Vertex3D, rB: Vertex3D, rF: Vertex3D): void {
		rB.setAndRelease(n.clone(true).multiplyScalar(-ball.data.radius))
		const hp = ball.state.pos.clone(true).add(rB)
		const cF = Vertex3D.claim(this.mover.hitCircleBase.center.x, this.mover.hitCircleBase.center.y, ball.state.pos.z)
		rF.setAndRelease(hp.clone(true).sub(cF))
		const vB = ball.hit.surfaceVelocity(rB, true),
			vF = this.mover.surfaceVelocity(rF, true)
		vRel.setAndRelease(vB.clone(true).sub(vF))
		Vertex3D.release(hp, cF, vB, vF)
	}

	private hitTestFlipperEnd(ball: Ball, dTime: number, coll: CollisionEvent): number {
		const angleCur = this.state.angle,
			base = this.mover.hitCircleBase.center
		let angleSpeed = this.mover.angleSpeed
		const aMin = Math.min(this.mover.angleStart, this.mover.angleEnd),
			aMax = Math.max(this.mover.angleStart, this.mover.angleEnd)
		const ballR = ball.data.radius,
			feR = this.mover.endRadius,
			ballEndR = feR + ballR,
			bx = ball.state.pos.x,
			by = ball.state.pos.y,
			bvX = ball.hit.vel.x,
			bvY = ball.hit.vel.y
		const vp = Vertex2D.claim(0, -this.mover.flipperRadius)
		let bvtx = 0,
			bvty = 0,
			contactAng = 0,
			bFend = 0,
			cbce = 0,
			t0 = 0,
			t1 = 0,
			d0 = 0,
			d1 = 0,
			dp = 0,
			t = 0,
			k = 0
		for (k = 1; k <= C_INTERATIONS; ++k) {
			contactAng = angleCur + angleSpeed * t
			if (contactAng >= aMax) contactAng = aMax
			else if (contactAng <= aMin) contactAng = aMin
			const s = Math.sin(contactAng),
				c = Math.cos(contactAng)
			const vt = Vertex2D.claim(vp.x * c - vp.y * s + base.x, vp.y * c + vp.x * s + base.y)
			bvtx = bx + bvX * t - vt.x
			bvty = by + bvY * t - vt.y
			Vertex2D.release(vt)
			cbce = Math.sqrt(bvtx * bvtx + bvty * bvty)
			bFend = cbce - ballEndR
			if (Math.abs(bFend) <= C_PRECISION) break
			if (k === 1) {
				if (bFend < -(ballR + feR)) {
					Vertex2D.release(vp)
					return -1
				}
				if (bFend <= PHYS_TOUCH) break
				t0 = t1 = dTime
				d0 = 0
				d1 = bFend
			} else if (k === 2) {
				if (dp * bFend > 0) {
					Vertex2D.release(vp)
					return -1
				}
				t0 = 0
				t1 = dTime
				d0 = dp
				d1 = bFend
			} else {
				if (bFend * d0 <= 0) {
					t1 = t
					d1 = bFend
					if (dp * bFend > 0) d0 *= 0.5
				} else {
					t0 = t
					d0 = bFend
					if (dp * bFend > 0) d1 *= 0.5
				}
			}
			t = t0 - (d0 * (t1 - t0)) / (d1 - d0)
			dp = bFend
		}
		Vertex2D.release(vp)
		if (!isFinite(t) || t < 0 || t > dTime || (k > C_INTERATIONS && Math.abs(bFend) > ballR * 0.25)) return -1
		const hitz = ball.state.pos.z + ball.hit.vel.z * t
		if (hitz + ballR * 0.5 < this.hitBBox.zlow || hitz - ballR * 0.5 > this.hitBBox.zhigh) return -1
		const inv = 1 / cbce
		coll.hitNormal.set(bvtx * inv, bvty * inv, 0)
		const dist = Vertex2D.claim(
			bx + bvX * t - ballR * coll.hitNormal.x - base.x,
			by + bvY * t - ballR * coll.hitNormal.y - base.y,
		)
		const d = Math.sqrt(dist.x * dist.x + dist.y * dist.y)
		if ((contactAng >= aMax && angleSpeed > 0) || (contactAng <= aMin && angleSpeed < 0)) angleSpeed = 0
		const invD = 1 / d
		coll.hitVel.set(-dist.y * invD, dist.x * invD)
		coll.hitMomentBit = d === 0
		Vertex2D.release(dist)
		const dv = Vertex2D.claim(bvX - coll.hitVel.x * angleSpeed * d, bvY - coll.hitVel.y * angleSpeed * d)
		const bnv = dv.x * coll.hitNormal.x + dv.y * coll.hitNormal.y
		Vertex2D.release(dv)
		if (bnv >= 0) return -1
		if (Math.abs(bnv) <= C_CONTACTVEL && bFend <= PHYS_TOUCH) {
			coll.isContact = true
			coll.hitOrgNormalVelocity = bnv
		}
		coll.hitDistance = bFend
		return t
	}

	public getHitTime(): number {
		return this.mover.getHitTime()
	}
}
