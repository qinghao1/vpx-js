// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { Vertex2D } from '../../math/vector.js'
import { DampedHarmonicOscillator } from './damped-harmonic-oscillator.js'

/** Cabinet physics — 2-D damped oscillator calibrated on real cabinets. @see https://github.com/vpinball/vpinball/blob/master/src/physics/cabinet/CabinetPhysics.h */
export class CabinetPhysics {
	private readonly oscX: DampedHarmonicOscillator
	private readonly oscY: DampedHarmonicOscillator
	private readonly acceleration = new Vertex2D()
	private readonly offset = new Vertex2D()

	constructor(mass = 113) {
		// Oscillation and damping calibrated on real cabinets (accelerometer recordings, 2026-09)
		this.oscX = new DampedHarmonicOscillator(mass, 4.5, 0.04)
		this.oscY = new DampedHarmonicOscillator(mass, 4.3, 0.055)
	}

	step(force: Vertex2D): void {
		const dt = 0.001
		this.oscX.step(force.x, dt)
		this.oscY.step(force.y, dt)
		this.acceleration.x = this.oscX.getAcceleration()
		this.acceleration.y = this.oscY.getAcceleration()
		this.offset.x = this.oscX.getDisplacement()
		this.offset.y = this.oscY.getDisplacement()
	}

	getAcceleration(): Vertex2D {
		return this.acceleration
	}
	getOffset(): Vertex2D {
		return this.offset
	}
	getMass(): number {
		return this.oscX.getMass()
	}
}
