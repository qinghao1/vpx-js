// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { MathUtils } from 'three'
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
import { Vertex3D } from '../../util/vector.js'

import type { TableData } from '../table/table-data.js'
import type { Ball } from './ball.js'
import type { BallData } from './ball-data.js'
import { BallMover } from './ball-mover.js'
import type { BallState } from './ball-state.js'

function solveQuadraticEq(a: number, b: number, c: number): [number, number] | undefined {
	const discr = b * b - 4 * a * c
	if (discr < 0) return undefined
	const sqrt = Math.sqrt(discr)
	const inv = -0.5 / a
	return [(b + sqrt) * inv, (b - sqrt) * inv]
}

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
	public isVisible = true

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
		if (!Number.isFinite(hitTime) || hitTime < 0 || hitTime > dTime) return -1
		const hx = ball.state.pos.x + dvx * hitTime
		const hy = ball.state.pos.y + dvy * hitTime
		const hz = ball.state.pos.z + dvz * hitTime
		const nx = hx - this.state.pos.x
		const ny = hy - this.state.pos.y
		const nz = hz - this.state.pos.z
		if (nx === 0 && ny === 0 && nz === 0) return -1
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
		const nx = coll.hitNormal.x,
			ny = coll.hitNormal.y,
			nz = coll.hitNormal.z
		const bvx = ball.hit.vel.x,
			bvy = ball.hit.vel.y,
			bvz = ball.hit.vel.z
		const tvx = this.vel.x,
			tvy = this.vel.y,
			tvz = this.vel.z
		const dvx = bvx - tvx,
			dvy = bvy - tvy,
			dvz = bvz - tvz
		let dot = dvx * nx + dvy * ny + dvz * nz
		if (dot >= -C_LOWNORMVEL) {
			if (dot > C_LOWNORMVEL) return
			if (coll.hitDistance < -C_EMBEDDED) dot = -C_EMBEDSHOT
			else return
		}
		let eDist = -C_DISP_GAIN * coll.hitDistance
		if (eDist > 1e-4) {
			if (eDist > C_DISP_LIMIT) eDist = C_DISP_LIMIT
			if (!this.state.isFrozen) eDist *= 0.5
			ball.state.pos.x += nx * eDist
			ball.state.pos.y += ny * eDist
			ball.state.pos.z += nz * eDist
		}
		eDist = -C_DISP_GAIN * this.coll.hitDistance
		if (!this.state.isFrozen && eDist > 1e-4) {
			if (eDist > C_DISP_LIMIT) eDist = C_DISP_LIMIT
			eDist *= 0.5
			this.state.pos.x -= nx * eDist
			this.state.pos.y -= ny * eDist
			this.state.pos.z -= nz * eDist
		}
		const myInv = this.state.isFrozen ? 0 : this.invMass
		const impulse = (-(1 + 0.8) * dot) / (myInv + ball.hit.invMass)
		if (!this.state.isFrozen) {
			this.vel.x -= nx * impulse * myInv
			this.vel.y -= ny * impulse * myInv
			this.vel.z -= nz * impulse * myInv
		}
		ball.hit.vel.x += nx * impulse * ball.hit.invMass
		ball.hit.vel.y += ny * impulse * ball.hit.invMass
		ball.hit.vel.z += nz * impulse * ball.hit.invMass
	}

	public collide3DWall(
		hitNormal: Vertex3D,
		elasticity: number,
		elasticityFalloff: number,
		friction: number,
		scatterAngle: number,
	): void {
		const nx = hitNormal.x,
			ny = hitNormal.y,
			nz = hitNormal.z
		let dot = this.vel.x * nx + this.vel.y * ny + this.vel.z * nz
		if (dot >= -C_LOWNORMVEL) {
			if (dot > C_LOWNORMVEL) return
			if (this.coll.hitDistance < -C_EMBEDDED) dot = -C_EMBEDSHOT
			else return
		}
		let hDist = -C_DISP_GAIN * this.coll.hitDistance
		if (hDist > 1e-4) {
			if (hDist > C_DISP_LIMIT) hDist = C_DISP_LIMIT
			this.state.pos.x += nx * hDist
			this.state.pos.y += ny * hDist
			this.state.pos.z += nz * hDist
		}
		const reaction = this.data.mass * Math.abs(dot)
		elasticity = elasticityWithFalloff(elasticity, elasticityFalloff, dot)
		dot *= -(1 + elasticity)
		this.vel.x += nx * dot
		this.vel.y += ny * dot
		this.vel.z += nz * dot

		const r = this.data.radius
		const sx = -nx * r,
			sy = -ny * r,
			sz = -nz * r
		const avx = this.angularVelocity.x,
			avy = this.angularVelocity.y,
			avz = this.angularVelocity.z
		const cx = avy * sz - avz * sy,
			cy = avz * sx - avx * sz,
			cz = avx * sy - avy * sx
		const svx = this.vel.x + cx,
			svy = this.vel.y + cy,
			svz = this.vel.z + cz
		const dotSN = svx * nx + svy * ny + svz * nz
		let tx = svx - dotSN * nx,
			ty = svy - dotSN * ny,
			tz = svz - dotSN * nz
		const tsq = tx * tx + ty * ty + tz * tz
		if (tsq > 1e-6) {
			const inv = 1 / Math.sqrt(tsq)
			tx *= inv
			ty *= inv
			tz *= inv
			const vt = svx * tx + svy * ty + svz * tz
			const crossX = sy * tz - sz * ty,
				crossY = sz * tx - sx * tz,
				crossZ = sx * ty - sy * tx
			const ciX = crossX / this.inertia,
				ciY = crossY / this.inertia,
				ciZ = crossZ / this.inertia
			const cross2X = ciY * sz - ciZ * sy,
				cross2Y = ciZ * sx - ciX * sz,
				cross2Z = ciX * sy - ciY * sx
			const kt = this.invMass + tx * cross2X + ty * cross2Y + tz * cross2Z
			const maxFric = friction * reaction
			const jt = MathUtils.clamp(-vt / kt, -maxFric, maxFric)
			if (Number.isFinite(jt)) {
				const jx = tx * jt,
					jy = ty * jt,
					jz = tz * jt
				const rotX = crossX * jt,
					rotY = crossY * jt,
					rotZ = crossZ * jt
				this.vel.x += jx * this.invMass
				this.vel.y += jy * this.invMass
				this.vel.z += jz * this.invMass
				this.angularMomentum.x += rotX
				this.angularMomentum.y += rotY
				this.angularMomentum.z += rotZ
				const inv = 1 / this.inertia
				this.angularVelocity.x = this.angularMomentum.x * inv
				this.angularVelocity.y = this.angularMomentum.y * inv
				this.angularVelocity.z = this.angularMomentum.z * inv
			}
		}
		if (scatterAngle < 0) scatterAngle = HARD_SCATTER
		scatterAngle *= this.tableData.globalDifficulty!
		if (dot > 1 && scatterAngle > 1e-5) {
			let scatter = Math.random() * 2 - 1
			scatter *= (1 - scatter * scatter) * 2.59808 * scatterAngle
			const s = Math.sin(scatter),
				c = Math.cos(scatter)
			const vx = this.vel.x,
				vy = this.vel.y
			this.vel.x = vx * c - vy * s
			this.vel.y = vy * c + vx * s
		}
	}

	public surfaceVelocity(surfP: Vertex3D, recycle = false): Vertex3D {
		const av = this.angularVelocity
		const cx = av.y * surfP.z - av.z * surfP.y,
			cy = av.z * surfP.x - av.x * surfP.z,
			cz = av.x * surfP.y - av.y * surfP.x
		if (recycle) return Vertex3D.claim(this.vel.x + cx, this.vel.y + cy, this.vel.z + cz)
		return new Vertex3D(this.vel.x + cx, this.vel.y + cy, this.vel.z + cz)
	}

	public applySurfaceImpulse(rotI: Vertex3D, impulse: Vertex3D, recycle = false): void {
		this.vel.x += impulse.x * this.invMass
		this.vel.y += impulse.y * this.invMass
		this.vel.z += impulse.z * this.invMass
		this.angularMomentum.x += rotI.x
		this.angularMomentum.y += rotI.y
		this.angularMomentum.z += rotI.z
		const inv = 1 / this.inertia
		this.angularVelocity.x = this.angularMomentum.x * inv
		this.angularVelocity.y = this.angularMomentum.y * inv
		this.angularVelocity.z = this.angularMomentum.z * inv
		if (recycle) Vertex3D.release(rotI, impulse)
	}

	public applySurfaceImpulseAndRelease(rotI: Vertex3D, impulse: Vertex3D): void {
		this.vel.x += impulse.x * this.invMass
		this.vel.y += impulse.y * this.invMass
		this.vel.z += impulse.z * this.invMass
		this.angularMomentum.x += rotI.x
		this.angularMomentum.y += rotI.y
		this.angularMomentum.z += rotI.z
		const inv = 1 / this.inertia
		this.angularVelocity.x = this.angularMomentum.x * inv
		this.angularVelocity.y = this.angularMomentum.y * inv
		this.angularVelocity.z = this.angularMomentum.z * inv
		Vertex3D.release(rotI, impulse)
	}

	public handleStaticContact(coll: CollisionEvent, friction: number, dTime: number, physics: PlayerPhysics): void {
		const nx = coll.hitNormal.x,
			ny = coll.hitNormal.y,
			nz = coll.hitNormal.z
		const normVel = this.vel.x * nx + this.vel.y * ny + this.vel.z * nz
		if (normVel > C_CONTACTVEL) return
		const gdot = physics.gravity.x * nx + physics.gravity.y * ny + physics.gravity.z * nz
		const normalForce = Math.max(0, -(gdot * this.data.mass * dTime + coll.hitOrgNormalVelocity!))
		this.vel.x += nx * normalForce
		this.vel.y += ny * normalForce
		this.vel.z += nz * normalForce
		if (coll.hitDistance <= PHYS_TOUCH) {
			const push = Math.max(Math.min(C_EMBEDVELLIMIT, -coll.hitDistance), PHYS_TOUCH)
			this.vel.x += nx * push
			this.vel.y += ny * push
			this.vel.z += nz * push
		}
		this.applyFriction(coll.hitNormal, dTime, friction, physics)
	}

	public applyFriction(hitNormal: Vertex3D, dtime: number, fricCoeff: number, physics: PlayerPhysics): void {
		const nx = hitNormal.x,
			ny = hitNormal.y,
			nz = hitNormal.z
		const r = this.data.radius
		const sx = -nx * r,
			sy = -ny * r,
			sz = -nz * r
		const avx = this.angularVelocity.x,
			avy = this.angularVelocity.y,
			avz = this.angularVelocity.z
		const cx = avy * sz - avz * sy,
			cy = avz * sx - avx * sz,
			cz = avx * sy - avy * sx
		const svx = this.vel.x + cx,
			svy = this.vel.y + cy,
			svz = this.vel.z + cz
		const dot = svx * nx + svy * ny + svz * nz
		const slipX = svx - dot * nx,
			slipY = svy - dot * ny,
			slipZ = svz - dot * nz
		const maxFric =
			fricCoeff * this.data.mass * -(physics.gravity.x * nx + physics.gravity.y * ny + physics.gravity.z * nz)
		const slipspeed = Math.sqrt(slipX * slipX + slipY * slipY + slipZ * slipZ)
		let slipDirX: number, slipDirY: number, slipDirZ: number, numer: number
		if (this.vel.x * nx + this.vel.y * ny + this.vel.z * nz <= 0.025 || slipspeed < C_PRECISION) {
			const gx = physics.gravity.x * this.invMass,
				gy = physics.gravity.y * this.invMass,
				gz = physics.gravity.z * this.invMass
			const p2x = avy * sz - avz * sy,
				p2y = avz * sx - avx * sz,
				p2z = avx * sy - avy * sx
			const crossAx = avy * p2z - avz * p2y,
				crossAy = avz * p2x - avx * p2z,
				crossAz = avx * p2y - avy * p2x
			const ax = gx + crossAx,
				ay = gy + crossAy,
				az = gz + crossAz
			const adot = ax * nx + ay * ny + az * nz
			const sAx = ax - adot * nx,
				sAy = ay - adot * ny,
				sAz = az - adot * nz
			if (sAx * sAx + sAy * sAy + sAz * sAz < 1e-6) return
			const inv = 1 / Math.sqrt(sAx * sAx + sAy * sAy + sAz * sAz)
			slipDirX = sAx * inv
			slipDirY = sAy * inv
			slipDirZ = sAz * inv
			numer = -(slipDirX * ax + slipDirY * ay + slipDirZ * az)
		} else {
			const inv = 1 / slipspeed
			slipDirX = slipX * inv
			slipDirY = slipY * inv
			slipDirZ = slipZ * inv
			numer = -(slipDirX * svx + slipDirY * svy + slipDirZ * svz)
		}
		const cpX = sy * slipDirZ - sz * slipDirY,
			cpY = sz * slipDirX - sx * slipDirZ,
			cpZ = sx * slipDirY - sy * slipDirX
		const p1x = cpX / this.inertia,
			p1y = cpY / this.inertia,
			p1z = cpZ / this.inertia
		const crossX = p1y * sz - p1z * sy,
			crossY = p1z * sx - p1x * sz,
			crossZ = p1x * sy - p1y * sx
		const denom = this.invMass + slipDirX * crossX + slipDirY * crossY + slipDirZ * crossZ
		const friction = MathUtils.clamp(numer / denom, -maxFric, maxFric)
		if (Number.isFinite(friction)) {
			const jx = slipDirX * dtime * friction,
				jy = slipDirY * dtime * friction,
				jz = slipDirZ * dtime * friction
			const rotX = cpX * dtime * friction,
				rotY = cpY * dtime * friction,
				rotZ = cpZ * dtime * friction
			this.vel.x += jx * this.invMass
			this.vel.y += jy * this.invMass
			this.vel.z += jz * this.invMass
			this.angularMomentum.x += rotX
			this.angularMomentum.y += rotY
			this.angularMomentum.z += rotZ
			const inv = 1 / this.inertia
			this.angularVelocity.x = this.angularMomentum.x * inv
			this.angularVelocity.y = this.angularMomentum.y * inv
			this.angularVelocity.z = this.angularMomentum.z * inv
		}
	}

	public surfaceAcceleration(surfP: Vertex3D, physics: PlayerPhysics, _recycle = false): Vertex3D {
		const avx = this.angularVelocity.x,
			avy = this.angularVelocity.y,
			avz = this.angularVelocity.z
		const p2x = avy * surfP.z - avz * surfP.y,
			p2y = avz * surfP.x - avx * surfP.z,
			p2z = avx * surfP.y - avy * surfP.x
		const crossX = avy * p2z - avz * p2y,
			crossY = avz * p2x - avx * p2z,
			crossZ = avx * p2y - avy * p2x
		const inv = this.invMass
		return new Vertex3D(
			physics.gravity.x * inv + crossX,
			physics.gravity.y * inv + crossY,
			physics.gravity.z * inv + crossZ,
		)
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
