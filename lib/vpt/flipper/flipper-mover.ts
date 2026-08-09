// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { MathUtils } from 'three'

import { Event } from '../../game/event.js'
import type { EventProxy } from '../../game/event-proxy.js'
import type { PlayerPhysics } from '../../game/player-physics.js'
import { PHYS_FACTOR } from '../../physics/constants.js'
import { HitCircle } from '../../physics/hit-circle.js'
import type { MoverObject } from '../../physics/mover-object.js'
import { logger } from '../../util/logger.js'
import { Vertex2D, Vertex3D } from '../../util/vector.js'
import type { TableData } from '../table/table-data.js'
import type { FlipperConfig } from './flipper.js'
import type { FlipperData } from './flipper-data.js'
import type { FlipperState } from './flipper-state.js'

/** Flipper mover — solenoid physics, contact, and EOS/BOS events. */
export class FlipperMover implements MoverObject {
	public hitCircleBase: HitCircle
	public endRadius: number
	public readonly flipperRadius: number

	private angularMomentum = 0
	private angularAcceleration = 0
	public angleSpeed = 0

	private curTorque = 0
	public contactTorque = 0

	public angleStart: number
	public angleEnd: number
	public inertia: number
	public zeroAngNorm = new Vertex2D()
	public enableRotateEvent = 0
	private readonly direction: boolean
	private solState = false
	public isInContact = false
	public lastHitFace = false

	constructor(
		config: FlipperConfig,
		private readonly data: FlipperData,
		private readonly state: FlipperState,
		private readonly events: EventProxy,
		readonly _physics: PlayerPhysics,
		private readonly tableData: TableData,
	) {
		this.hitCircleBase = new HitCircle(config.center, config.baseRadius, config.zLow, config.zHigh)
		this.endRadius = config.endRadius
		this.flipperRadius = config.flipperRadius
		if (config.angleEnd === config.angleStart) config.angleEnd += 0.0001
		this.direction = config.angleEnd >= config.angleStart
		this.angleStart = config.angleStart
		this.angleEnd = config.angleEnd
		this.state.angle = config.angleStart
		const ratio = (config.baseRadius - config.endRadius) / config.flipperRadius
		this.inertia = (1 / 3) * this.getFlipperMass() * (config.flipperRadius * config.flipperRadius)
		this.zeroAngNorm.x = Math.sqrt(1 - ratio * ratio)
		this.zeroAngNorm.y = -ratio
	}

	public updateDisplacements(dtime: number): void {
		this.state.angle += this.angleSpeed * dtime
		const angleMin = Math.min(this.angleStart, this.angleEnd)
		const angleMax = Math.max(this.angleStart, this.angleEnd)
		this.state.angle = Math.max(angleMin, Math.min(angleMax, this.state.angle))
		if (Math.abs(this.angleSpeed) < 0.0005) return

		let handleEvent = false
		if (this.state.angle === angleMax && this.angleSpeed > 0) handleEvent = true
		else if (this.state.angle === angleMin && this.angleSpeed < 0) handleEvent = true

		if (handleEvent) {
			const anglespd = Math.abs(MathUtils.radToDeg(this.angleSpeed))
			this.angularMomentum *= -0.3
			this.angleSpeed = this.angularMomentum / this.inertia
			if (this.enableRotateEvent > 0) {
				logger().info('[%s] Flipper is up', this.data.getName())
				this.events.fireVoidEventParm(Event.LimitEventsEOS, anglespd)
			} else if (this.enableRotateEvent < 0) {
				logger().info('[%s] Flipper is down', this.data.getName())
				this.events.fireVoidEventParm(Event.LimitEventsBOS, anglespd)
			}
			this.enableRotateEvent = 0
		}
	}

	public updateVelocities(): void {
		let desiredTorque = this.getStrength()
		if (!this.solState) desiredTorque *= -this.getReturnRatio()
		const eosAngle = MathUtils.degToRad(this.getTorqueDampingAngle())
		if (Math.abs(this.state.angle - this.angleEnd) < eosAngle) {
			const lerp = Math.sqrt(Math.sqrt(Math.abs(this.state.angle - this.angleEnd) / eosAngle))
			desiredTorque *= lerp + this.getTorqueDamping() * (1 - lerp)
		}
		if (!this.direction) desiredTorque = -desiredTorque

		let ramp = this.getRampUpSpeed()
		ramp = ramp <= 0 ? 1e6 : Math.min(this.getStrength() / ramp, 1e6)
		if (desiredTorque >= this.curTorque)
			this.curTorque = Math.min(this.curTorque + ramp * PHYS_FACTOR, desiredTorque)
		else this.curTorque = Math.max(this.curTorque - ramp * PHYS_FACTOR, desiredTorque)

		let torque = this.curTorque
		this.isInContact = false
		if (Math.abs(this.angleSpeed) <= 1e-2) {
			const angleMin = Math.min(this.angleStart, this.angleEnd)
			const angleMax = Math.max(this.angleStart, this.angleEnd)
			if (this.state.angle >= angleMax - 1e-2 && torque > 0) {
				this.state.angle = angleMax
				this.isInContact = true
				this.contactTorque = torque
				this.angularMomentum = 0
				torque = 0
			} else if (this.state.angle <= angleMin + 1e-2 && torque < 0) {
				this.state.angle = angleMin
				this.isInContact = true
				this.contactTorque = torque
				this.angularMomentum = 0
				torque = 0
			}
		}
		this.angularMomentum += PHYS_FACTOR * torque
		this.angleSpeed = this.angularMomentum / this.inertia
		this.angularAcceleration = torque / this.inertia
	}

	public setSolenoidState(s: boolean): void {
		this.solState = s
	}

	public getReturnRatio(): number {
		return this.doOverridePhysics() ? this.data.overrideReturnStrength! : this.data.return!
	}
	public getStrength(): number {
		return this.doOverridePhysics() ? this.data.overrideStrength! : this.data.strength!
	}
	private getTorqueDampingAngle(): number {
		return this.doOverridePhysics() ? this.data.overrideTorqueDampingAngle! : this.data.torqueDampingAngle!
	}
	private getFlipperMass(): number {
		return this.doOverridePhysics() ? this.data.overrideMass! : this.data.mass
	}
	private getTorqueDamping(): number {
		return this.doOverridePhysics() ? this.data.overrideTorqueDamping! : this.data.torqueDamping!
	}
	private getRampUpSpeed(): number {
		return this.doOverridePhysics() ? this.data.overrideCoilRampUp! : this.data.rampUp!
	}
	private doOverridePhysics(): boolean {
		return (
			!!this.data.overridePhysics || (!!this.tableData.overridePhysicsFlipper && !!this.tableData.overridePhysics)
		)
	}

	public surfaceVelocity(surfP: Vertex3D, recycle = false): Vertex3D {
		return Vertex3D.crossZ(this.angleSpeed, surfP, recycle)
	}

	public getHitTime(): number {
		if (this.angleSpeed === 0) return -1
		const angleMin = Math.min(this.angleStart, this.angleEnd),
			angleMax = Math.max(this.angleStart, this.angleEnd)
		const dist = this.angleSpeed > 0 ? angleMax - this.state.angle : angleMin - this.state.angle
		const hitTime = dist / this.angleSpeed
		return !Number.isFinite(hitTime) || hitTime < 0 ? -1 : hitTime
	}

	/** @deprecated Use {@link #applyImpulseAndRelease()} */
	public applyImpulse(rotI: Vertex3D): void {
		this.angularMomentum += rotI.z
		this.angleSpeed = this.angularMomentum / this.inertia
	}
	public applyImpulseAndRelease(rotI: Vertex3D): void {
		this.angularMomentum += rotI.z
		this.angleSpeed = this.angularMomentum / this.inertia
		Vertex3D.release(rotI)
	}

	public surfaceAcceleration(surfP: Vertex3D, recycle = false): Vertex3D {
		const tangAcc = Vertex3D.crossZ(this.angularAcceleration, surfP, recycle)
		const av2 = this.angleSpeed * this.angleSpeed
		return tangAcc.addAndRelease(Vertex3D.claim(-av2 * surfP.x, -av2 * surfP.y, 0))
	}

	public setStartAngle(r: number): void {
		this.angleStart = r
		this.clampStateAngle()
	}

	public setEndAngle(r: number): void {
		this.angleEnd = r
		this.clampStateAngle()
	}

	private clampStateAngle(): void {
		const lo = Math.min(this.angleStart, this.angleEnd)
		const hi = Math.max(this.angleStart, this.angleEnd)
		this.state.angle = Math.max(lo, Math.min(hi, this.state.angle))
	}

	public getMass(): number {
		return (3 * this.inertia) / (this.flipperRadius * this.flipperRadius)
	}
	public setMass(m: number): void {
		this.inertia = (1 / 3) * m * (this.flipperRadius * this.flipperRadius)
	}
}
