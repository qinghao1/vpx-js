// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { EventProxy } from '../../game/event-proxy.js'
import type { PlayerPhysics } from '../../game/player-physics.js'
import { CollisionEvent } from '../../physics/collision-event.js'
import {
	C_CONTACTVEL,
	C_DISP_GAIN,
	C_DISP_LIMIT,
	C_EMBEDDED,
	C_EMBEDSHOT,
	C_EMBEDVELLIMIT,
	C_LOWNORMVEL,
	C_PRECISION,
	PHYS_TOUCH,
} from '../../physics/constants.js'
import { elasticityWithFalloff, HARD_SCATTER } from '../../physics/functions.js'
import { HitObject } from '../../physics/hit-object.js'
import { FLT_MIN } from '../../util/float.js'
import { clamp, solveQuadraticEq } from '../../util/functions.js'
import { Vertex3D } from '../../util/math.js'
import type { TableData } from '../table/table-data.js'
import type { Ball } from './ball.js'
import type { BallData } from './ball-data.js'
import { BallMover } from './ball-mover.js'
import type { BallState } from './ball-state.js'

/** Ball collision shape — separated from {@code ball.cpp}. @see https://github.com/vpinball/vpinball/blob/master/ball.cpp */
export class BallHit extends HitObject {
	public readonly coll: CollisionEvent
	public rcHitRadiusSqr = 0
	public vpVolObjs: EventProxy[] = []

	private readonly id: number
	private readonly data: BallData
	private readonly state: BallState
	private readonly mover: BallMover
	private readonly tableData: TableData

	public readonly vel: Vertex3D
	public readonly angularMomentum = new Vertex3D()
	public invMass: number
	public inertia: number
	public eventPos = new Vertex3D(-1, -1, -1)
	public angularVelocity = new Vertex3D()

	private playfieldReflectionStrength = 1
	private reflectionEnabled = true
	private forceReflection = false
	public isVisible = true
	private defaultZ = 25

	constructor(ball: Ball, data: BallData, state: BallState, initialVelocity: Vertex3D, tableData: TableData) {
		super()
		this.id = ball.id
		this.data = data
		this.state = state
		this.tableData = tableData
		this.vel = initialVelocity
		this.mover = new BallMover(this.id, data, state, this)
		this.invMass = 1 / data.mass
		this.inertia = (2 / 5) * data.radius * data.radius * data.mass
		this.state.isFrozen = false
		this.coll = new CollisionEvent(ball)
		if (initialVelocity) this.calcHitBBox()
		this.defaultZ = this.state.pos.z
	}

	public isRealBall(): boolean {
		return !!this.vpVolObjs
	}

	public override calcHitBBox(): void {
		const vl = this.vel.length() + this.data.radius + 0.05
		const p = this.state.pos
		this.hitBBox.left = p.x - vl
		this.hitBBox.right = p.x + vl
		this.hitBBox.top = p.y - vl
		this.hitBBox.bottom = p.y + vl
		this.hitBBox.zlow = p.z - vl
		this.hitBBox.zhigh = p.z + vl
		this.rcHitRadiusSqr = vl * vl
		if (p.z === this.data.radius + this.tableData.tableHeight) this.defaultZ = p.z
	}

	public getMoverObject(): BallMover {
		return this.mover
	}

	public override hitTest(ball: Ball, dTime: number, coll: CollisionEvent, _physics?: PlayerPhysics): number {
		const dx = this.state.pos.x - ball.state.pos.x
		const dy = this.state.pos.y - ball.state.pos.y
		const dz = this.state.pos.z - ball.state.pos.z
		const bcddSq = dx * dx + dy * dy + dz * dz
		const bcdd = Math.sqrt(bcddSq)
		if (bcdd < 1e-6) return -1
		const dvx = this.vel.x - ball.hit.vel.x
		const dvy = this.vel.y - ball.hit.vel.y
		const dvz = this.vel.z - ball.hit.vel.z
		const b = dvx * dx + dvy * dy + dvz * dz
		const bnv = b / bcdd
		if (bnv > C_LOWNORMVEL) return -1
		const totalR = ball.data.radius + this.data.radius
		const bnd = bcdd - totalR
		let hitTime: number
		let isContact = false
		if (bnd <= PHYS_TOUCH) {
			if (bnd < ball.data.radius * -2) return -1
			if (Math.abs(bnv) > C_CONTACTVEL || bnd <= -PHYS_TOUCH) hitTime = 0
			else hitTime = bnd * (1 / (2 * PHYS_TOUCH)) + 0.5
			if (Math.abs(bnv) <= C_CONTACTVEL) isContact = true
		} else {
			const a = dvx * dvx + dvy * dvy + dvz * dvz
			if (a < 1e-8) return -1
			const sol = solveQuadraticEq(a, 2 * b, bcddSq - totalR * totalR)
			if (!sol) return -1
			const [t1, t2] = sol
			hitTime = t1 * t2 < 0 ? Math.max(t1, t2) : Math.min(t1, t2)
		}
		if (!isFinite(hitTime) || hitTime < 0 || hitTime > dTime) return -1
		const hx = ball.state.pos.x + dvx * hitTime
		const hy = ball.state.pos.y + dvy * hitTime
		const hz = ball.state.pos.z + dvz * hitTime
		const nx = hx - this.state.pos.x
		const ny = hy - this.state.pos.y
		const nz = hz - this.state.pos.z
		if (Math.abs(nx) <= FLT_MIN && Math.abs(ny) <= FLT_MIN && Math.abs(nz) <= FLT_MIN) return -1
		const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
		coll.hitNormal.set(nx / len, ny / len, nz / len)
		coll.hitDistance = bnd
		coll.isContact = isContact
		if (isContact) coll.hitOrgNormalVelocity = bnv
		return hitTime
	}

	public override collide(coll: CollisionEvent, physics: PlayerPhysics): void {
		const ball = coll.ball
		if (
			((physics.swapBallCollisionHandling && ball.id >= this.id) ||
				(!physics.swapBallCollisionHandling && ball.id <= this.id)) &&
			!this.state.isFrozen
		) {
			return
		}

		const vRel = ball.hit.vel.clone(true).sub(this.vel)
		const vNormal = coll.hitNormal.clone(true) // hitball.cpp:245 — by value, don't alias pooled hitNormal
		let dot = vRel.dot(vNormal)
		Vertex3D.release(vRel)

		if (dot >= -C_LOWNORMVEL) {
			if (dot > C_LOWNORMVEL) return
			if (coll.hitDistance < -C_EMBEDDED) dot = -C_EMBEDSHOT
			else return
		}

		let eDist = -C_DISP_GAIN * coll.hitDistance
		if (eDist > 1e-4) {
			if (eDist > C_DISP_LIMIT) eDist = C_DISP_LIMIT
			if (!this.state.isFrozen) eDist *= 0.5
			ball.state.pos.addAndRelease(vNormal.clone(true).multiplyScalar(eDist))
		}
		eDist = -C_DISP_GAIN * this.coll.hitDistance // hitball.cpp:259 — m_coll is noisy, recompute
		if (!this.state.isFrozen && eDist > 1e-4) {
			if (eDist > C_DISP_LIMIT) eDist = C_DISP_LIMIT
			eDist *= 0.5
			this.state.pos.subAndRelease(vNormal.clone(true).multiplyScalar(eDist))
		}

		const myInvMass = this.state.isFrozen ? 0 : this.invMass
		const impulse = (-(1 + 0.8) * dot) / (myInvMass + ball.hit.invMass)

		if (!this.state.isFrozen) this.vel.subAndRelease(vNormal.clone(true).multiplyScalar(impulse * myInvMass))
		ball.hit.vel.addAndRelease(vNormal.clone(true).multiplyScalar(impulse * ball.hit.invMass))
		Vertex3D.release(vNormal)
	}

	public collide3DWall(
		hitNormal: Vertex3D,
		elasticity: number,
		elasticityFalloff: number,
		friction: number,
		scatterAngle: number,
	): void {
		let dot = this.vel.dot(hitNormal)
		if (dot >= -C_LOWNORMVEL) {
			if (dot > C_LOWNORMVEL) return
			if (this.coll.hitDistance < -C_EMBEDDED) dot = -C_EMBEDSHOT
			else return
		}

		let hDist = -C_DISP_GAIN * this.coll.hitDistance
		if (hDist > 1e-4) {
			if (hDist > C_DISP_LIMIT) hDist = C_DISP_LIMIT
			this.state.pos.addAndRelease(hitNormal.clone(true).multiplyScalar(hDist))
		}

		const reactionImpulse = this.data.mass * Math.abs(dot)
		elasticity = elasticityWithFalloff(elasticity, elasticityFalloff, dot)
		dot *= -(1 + elasticity)
		this.vel.addAndRelease(hitNormal.clone(true).multiplyScalar(dot))

		const surfP = hitNormal.clone(true).multiplyScalar(-this.data.radius)
		const surfVel = this.surfaceVelocity(surfP, true)
		const tangent = surfVel.clone(true).subAndRelease(hitNormal.clone(true).multiplyScalar(surfVel.dot(hitNormal)))

		const tangentSpSq = tangent.lengthSq()
		if (tangentSpSq > 1e-6) {
			tangent.divideScalar(Math.sqrt(tangentSpSq))
			const vt = surfVel.dot(tangent)
			const cross = Vertex3D.crossProduct(surfP, tangent, true)
			const crossInertia = cross.clone(true).divideScalar(this.inertia)
			const kt = this.invMass + tangent.dotAndRelease(Vertex3D.crossProduct(crossInertia, surfP, true))
			Vertex3D.release(crossInertia)
			const maxFric = friction * reactionImpulse
			const jt = clamp(-vt / kt, -maxFric, maxFric)
			if (isFinite(jt)) {
				this.applySurfaceImpulseAndRelease(cross.clone(true).multiplyScalar(jt), tangent.clone(true).multiplyScalar(jt))
			}
			Vertex3D.release(cross)
		}
		Vertex3D.release(surfP, surfVel, tangent)

		if (scatterAngle < 0) scatterAngle = HARD_SCATTER
		scatterAngle *= this.tableData.globalDifficulty!

		if (dot > 1 && scatterAngle > 1e-5) {
			let scatter = Math.random() * 2 - 1
			scatter *= (1 - scatter * scatter) * 2.59808 * scatterAngle
			const radsin = Math.sin(scatter)
			const radcos = Math.cos(scatter)
			const vxt = this.vel.x
			const vyt = this.vel.y
			this.vel.x = vxt * radcos - vyt * radsin
			this.vel.y = vyt * radcos + vxt * radsin
		}
	}

	public surfaceVelocity(surfP: Vertex3D, recycle = false): Vertex3D {
		return this.vel.clone(recycle).addAndRelease(Vertex3D.crossProduct(this.angularVelocity, surfP, true))
	}

	/** @deprecated prefer applySurfaceImpulseAndRelease */
	public applySurfaceImpulse(rotI: Vertex3D, impulse: Vertex3D, recycle = false): void {
		this.vel.addAndRelease(impulse.clone(true).multiplyScalar(this.invMass))
		this.angularMomentum.add(rotI)
		const am = this.angularMomentum.clone(true)
		this.angularVelocity.set(am.divideScalar(this.inertia))
		if (recycle) Vertex3D.release(rotI, impulse)
		Vertex3D.release(am)
	}

	public applySurfaceImpulseAndRelease(rotI: Vertex3D, impulse: Vertex3D): void {
		this.vel.addAndRelease(impulse.clone(true).multiplyScalar(this.invMass))
		this.angularMomentum.add(rotI)
		const am = this.angularMomentum.clone(true)
		this.angularVelocity.set(am.divideScalar(this.inertia))
		Vertex3D.release(rotI, impulse, am)
	}

	public handleStaticContact(coll: CollisionEvent, friction: number, dTime: number, physics: PlayerPhysics): void {
		const normVel = this.vel.dot(coll.hitNormal)
		if (normVel > C_CONTACTVEL) return

		const fe = physics.gravity.clone(true).multiplyScalar(this.data.mass)
		const dot = fe.dot(coll.hitNormal)
		const normalForce = Math.max(0, -(dot * dTime + coll.hitOrgNormalVelocity!))
		Vertex3D.release(fe)

		this.vel.addAndRelease(coll.hitNormal.clone(true).multiplyScalar(normalForce))
		if (coll.hitDistance <= PHYS_TOUCH) {
			this.vel.addAndRelease(
				coll.hitNormal.clone(true).multiplyScalar(Math.max(Math.min(C_EMBEDVELLIMIT, -coll.hitDistance), PHYS_TOUCH)),
			)
		}
		this.applyFriction(coll.hitNormal, dTime, friction, physics)
	}

	public applyFriction(hitNormal: Vertex3D, dtime: number, fricCoeff: number, physics: PlayerPhysics): void {
		const surfP = hitNormal.clone(true).multiplyScalar(-this.data.radius)
		const surfVel = this.surfaceVelocity(surfP, true)
		const slip = surfVel.clone(true).subAndRelease(hitNormal.clone(true).multiplyScalar(surfVel.dot(hitNormal)))

		const maxFric = fricCoeff * this.data.mass * -physics.gravity.dot(hitNormal)
		const slipspeed = slip.length()
		let slipDir: Vertex3D
		let numer: number

		const normVel = this.vel.dot(hitNormal)
		if (normVel <= 0.025 || slipspeed < C_PRECISION) {
			const surfAcc = this.surfaceAcceleration(surfP, physics, true)
			const slipAcc = surfAcc.clone(true).subAndRelease(hitNormal.clone(true).multiplyScalar(surfAcc.dot(hitNormal)))
			if (slipAcc.lengthSq() < 1e-6) {
				Vertex3D.release(surfVel, surfP, slip, slipAcc, surfAcc)
				return
			}
			slipDir = slipAcc.clone(true).normalize()
			numer = -slipDir.dot(surfAcc)
			Vertex3D.release(surfAcc, slipAcc)
		} else {
			slipDir = slip.clone(true).divideScalar(slipspeed)
			numer = -slipDir.dot(surfVel)
		}

		const cp = Vertex3D.crossProduct(surfP, slipDir, true)
		const p1 = cp.clone(true).divideScalar(this.inertia)
		const denom = this.invMass + slipDir.dotAndRelease(Vertex3D.crossProduct(p1, surfP, true))
		const friction = clamp(numer / denom, -maxFric, maxFric)

		if (isFinite(friction)) {
			this.applySurfaceImpulseAndRelease(
				cp.clone(true).multiplyScalar(dtime * friction),
				slipDir.clone(true).multiplyScalar(dtime * friction),
			)
		}
		Vertex3D.release(surfVel, cp, surfP, slip, slipDir, p1)
	}

	public surfaceAcceleration(surfP: Vertex3D, physics: PlayerPhysics, recycle = false): Vertex3D {
		const p2 = Vertex3D.crossProduct(this.angularVelocity, surfP, true)
		const acc = physics.gravity
			.clone(recycle)
			.multiplyScalar(this.invMass)
			.addAndRelease(Vertex3D.crossProduct(this.angularVelocity, p2, true))
		Vertex3D.release(p2)
		return acc
	}

	public setMass(mass: number): void {
		this.data.mass = mass
		this.invMass = 1 / mass
		this.inertia = (2 / 5) * this.data.radius * this.data.radius * this.data.mass
	}

	public setRadius(radius: number): void {
		this.data.radius = radius
		this.inertia = (2 / 5) * this.data.radius * this.data.radius * this.data.mass
		this.calcHitBBox()
	}
}
