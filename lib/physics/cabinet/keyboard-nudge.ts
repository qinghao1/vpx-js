// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { PHYS_FACTOR } from '../constants.js'
import { Vertex2D } from '../../util/vector.js'
import { CabinetPhysics } from './cabinet-physics.js'

const VPUTOM = (x: number): number => x * (0.0254 * 1.0625 / 50)
const MTOVPU = (x: number): number => x * (50 / (0.0254 * 1.0625))
const STOVPT = (x: number): number => x * 0.01
const VPTTOS = (x: number): number => x / 0.01
const MS2TOVPUVPT2 = (x: number): number => MTOVPU(x) * STOVPT(STOVPT(1))
const VPUVPT2TOMS2 = (x: number): number => VPUTOM(x) * VPTTOS(VPTTOS(1))

function degToRad(d: number): number { return (d * Math.PI) / 180 }

export interface KeyboardNudge {
	getAcceleration(): Vertex2D
	getOffset(): Vertex2D
	isActive(): boolean
	nudge(angle: number, force: number): void
	stepOneMillisecond(): void
	getStrength(): number
	setStrength(v: number): void
}

export class PushRetractKeyboardNudge implements KeyboardNudge {
	private readonly acceleration = new Vertex2D()
	private readonly offset = new Vertex2D()
	private impulse = new Vertex2D()
	private nudgeTime = 0
	private deactivationDelay = 0

	constructor(private strength = 1) {}

	getStrength(): number { return this.strength }
	setStrength(v: number): void { this.strength = v }
	getAcceleration(): Vertex2D { return this.acceleration }
	getOffset(): Vertex2D { return this.offset }
	isActive(): boolean { return this.deactivationDelay > 0 }

	nudge(angle: number, force: number): void {
		this.deactivationDelay = 10000
		if (this.nudgeTime !== 0) return
		const a = degToRad(angle)
		this.impulse.x = Math.sin(a) * this.strength * force
		this.impulse.y = -Math.cos(a) * this.strength * force
		this.nudgeTime = 100
	}

	stepOneMillisecond(): void {
		if (this.deactivationDelay) this.deactivationDelay--
		if (this.nudgeTime !== 0) {
			this.nudgeTime--
			if (this.nudgeTime === 95) {
				this.acceleration.x = -this.impulse.x * 2
				this.acceleration.y = this.impulse.y * 2
				this.acceleration.x *= 1 / PHYS_FACTOR
				this.acceleration.y *= 1 / PHYS_FACTOR
				this.acceleration.x = VPUVPT2TOMS2(this.acceleration.x)
				this.acceleration.y = VPUVPT2TOMS2(this.acceleration.y)
			} else if (this.nudgeTime === 90) {
				this.acceleration.x = this.impulse.x
				this.acceleration.y = -this.impulse.y
				this.acceleration.x *= 1 / PHYS_FACTOR
				this.acceleration.y *= 1 / PHYS_FACTOR
				this.acceleration.x = VPUVPT2TOMS2(this.acceleration.x)
				this.acceleration.y = VPUVPT2TOMS2(this.acceleration.y)
			} else {
				this.acceleration.set(0, 0)
			}
		}
		const attenuation = (this.nudgeTime * 0.01) ** 2
		this.offset.x = VPUTOM(this.impulse.x * attenuation)
		this.offset.y = VPUTOM(-this.impulse.y * attenuation)
	}
}

export class BoxModelKeyboardNudge implements KeyboardNudge {
	private readonly acceleration = new Vertex2D()
	private readonly prevVelocity = new Vertex2D()
	private readonly velocity = new Vertex2D()
	private readonly offset = new Vertex2D()
	private posVPU = new Vertex2D()
	private strength: number
	private readonly spring: number
	private readonly damping: number
	private deactivationDelay = 0

	constructor(strength = 1, nudgeTime = 5) {
		this.strength = strength
		const T = nudgeTime
		const zeta = 0.5
		this.spring = (Math.PI * Math.PI) / (T * T * (1 - zeta * zeta))
		this.damping = zeta * 2 * Math.sqrt(this.spring)
	}

	getStrength(): number { return this.strength }
	setStrength(v: number): void { this.strength = v }
	getAcceleration(): Vertex2D { return this.acceleration }
	getOffset(): Vertex2D { return this.offset }
	isActive(): boolean { return this.deactivationDelay > 0 }

	nudge(angle: number, force: number): void {
		this.deactivationDelay = 10000
		const a = degToRad(angle)
		this.velocity.x += Math.sin(a) * this.strength * force
		this.velocity.y += -Math.cos(a) * this.strength * force
	}

	stepOneMillisecond(): void {
		if (this.deactivationDelay) this.deactivationDelay--
		const force = new Vertex2D(
			-this.spring * this.posVPU.x - this.damping * this.velocity.x,
			-this.spring * this.posVPU.y - this.damping * this.velocity.y,
		)
		this.velocity.x += PHYS_FACTOR * force.x
		this.velocity.y += PHYS_FACTOR * force.y
		this.posVPU.x += PHYS_FACTOR * this.velocity.x
		this.posVPU.y += PHYS_FACTOR * this.velocity.y
		this.offset.x = VPUTOM(this.posVPU.x)
		this.offset.y = VPUTOM(this.posVPU.y)
		this.acceleration.x = VPUVPT2TOMS2((this.velocity.x - this.prevVelocity.x) * (1 / PHYS_FACTOR))
		this.acceleration.y = VPUVPT2TOMS2((this.velocity.y - this.prevVelocity.y) * (1 / PHYS_FACTOR))
		this.prevVelocity.x = this.velocity.x
		this.prevVelocity.y = this.velocity.y
	}
}

export class CabModelKeyboardNudge implements KeyboardNudge {
	private readonly cabinet = new CabinetPhysics()
	private impulses: Array<{ elapsed: number; length: number; impulse: Vertex2D }> = []
	private readonly acceleration = new Vertex2D()
	private deactivationDelay = 0

	constructor(private strength = 1) {}

	getStrength(): number { return this.strength }
	setStrength(v: number): void { this.strength = v }
	getAcceleration(): Vertex2D { return this.cabinet.getAcceleration() }
	getOffset(): Vertex2D { return this.cabinet.getOffset() }
	isActive(): boolean { return this.deactivationDelay > 0 }

	nudge(angle: number, force: number): void {
		const g = 9.80665
		const baseScale = (0.5 * g) / 2
		const actual = force * this.strength * baseScale
		const a = degToRad(angle)
		const fx = Math.sin(a) * actual
		const fy = -Math.cos(a) * actual
		this.impulses.push({ elapsed: 0, length: 25, impulse: new Vertex2D(fx, fy) })
		this.deactivationDelay = 10000
	}

	stepOneMillisecond(): void {
		if (this.deactivationDelay) this.deactivationDelay--
		const impulse = new Vertex2D()
		this.impulses = this.impulses.filter(it => {
			it.elapsed++
			if (it.elapsed <= it.length) {
				const t = it.elapsed / it.length
				const s = 0.5 * (1 - Math.cos(2 * Math.PI * t))
				impulse.x += it.impulse.x * s
				impulse.y += it.impulse.y * s
				return true
			}
			return false
		})
		const force = new Vertex2D(this.cabinet.getMass() * impulse.x, this.cabinet.getMass() * impulse.y)
		this.cabinet.step(force)
	}
}

export type KeyboardNudgeMode = 'push-retract' | 'box' | 'cab'

export function createKeyboardNudge(mode: KeyboardNudgeMode = 'cab', strength = 1): KeyboardNudge {
	switch (mode) {
		case 'push-retract': return new PushRetractKeyboardNudge(strength)
		case 'box': return new BoxModelKeyboardNudge(strength)
		case 'cab': return new CabModelKeyboardNudge(strength)
	}
}
