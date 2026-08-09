// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/** Damped harmonic oscillator — 1-D mass-spring-damper. @see https://github.com/vpinball/vpinball/blob/master/src/physics/cabinet/DampedHarmonicOscillator.h */
export class DampedHarmonicOscillator {
	private readonly mass: number
	private readonly omega0: number
	private readonly k: number
	private readonly damping: number
	private displacement = 0
	private velocity = 0
	private acceleration = 0

	constructor(mass: number, freq: number, zeta: number) {
		this.mass = mass
		this.omega0 = 2 * Math.PI * freq
		this.k = mass * this.omega0 * this.omega0
		this.damping = 2 * zeta * mass * this.omega0
	}

	step(force: number, dt: number): void {
		this.acceleration = (force - this.damping * this.velocity - this.k * this.displacement) / this.mass
		this.velocity += this.acceleration * dt
		this.displacement += this.velocity * dt
	}

	reset(): void {
		this.acceleration = 0
		this.velocity = 0
		this.displacement = 0
	}

	getDisplacement(): number { return this.displacement }
	getVelocity(): number { return this.velocity }
	getAcceleration(): number { return this.acceleration }
	getMass(): number { return this.mass }
}
