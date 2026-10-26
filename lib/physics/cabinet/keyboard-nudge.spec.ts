import { describe, expect, it } from 'vitest'
import { Vertex2D } from '../../math/vector.js'
import { CabinetPhysics } from './cabinet-physics.js'
import { DampedHarmonicOscillator } from './damped-harmonic-oscillator.js'
import { CabNudge } from './keyboard-nudge.js'
import { NudgeHandler } from './nudge-handler.js'

describe('CabNudge', () => {
	it('scales a full-strength nudge to StrongNudgeAcceleration (0.7g)', () => {
		const gravity = 9.80665
		const strongNudgeAcceleration = 0.7 * gravity
		const nudge = new CabNudge()
		nudge.nudge(0, 2)
		nudge.stepOneMillisecond()
		// First 1ms step from rest: cabinet acceleration equals the raised-cosine-weighted impulse.
		const envelope = 0.5 * (1 - Math.cos((2 * Math.PI) / 25))
		const acceleration = nudge.getAcceleration()
		expect(acceleration.x).toBeCloseTo(0, 10)
		expect(acceleration.y).toBeCloseTo(-strongNudgeAcceleration * envelope, 10)
	})

	it('maps angle 90 to +x and angle 180 to +y', () => {
		const strongNudgeAcceleration = 0.7 * 9.80665
		const envelope = 0.5 * (1 - Math.cos((2 * Math.PI) / 25))
		const right = new CabNudge()
		right.nudge(90, 2)
		right.stepOneMillisecond()
		expect(right.getAcceleration().x).toBeCloseTo(strongNudgeAcceleration * envelope, 10)
		expect(right.getAcceleration().y).toBeCloseTo(0, 10)
		const down = new CabNudge()
		down.nudge(180, 2)
		down.stepOneMillisecond()
		expect(down.getAcceleration().x).toBeCloseTo(0, 10)
		expect(down.getAcceleration().y).toBeCloseTo(strongNudgeAcceleration * envelope, 10)
	})

	it('rings down after the 25ms impulse expires', () => {
		const nudge = new CabNudge()
		expect(nudge.isActive()).toBe(false)
		nudge.nudge(0, 2)
		expect(nudge.isActive()).toBe(true)
		for (let i = 0; i < 3000; i++) nudge.stepOneMillisecond()
		const acceleration = nudge.getAcceleration()
		expect(Math.hypot(acceleration.x, acceleration.y)).toBeLessThan(0.1)
	})

	it('stays at rest with no nudge', () => {
		const nudge = new CabNudge()
		for (let i = 0; i < 10; i++) nudge.stepOneMillisecond()
		expect(nudge.getAcceleration().x).toBe(0)
		expect(nudge.getAcceleration().y).toBe(0)
		expect(nudge.getOffset().x).toBe(0)
		expect(nudge.getOffset().y).toBe(0)
	})
})

describe('DampedHarmonicOscillator', () => {
	it('integrates force to acceleration, velocity, displacement', () => {
		const osc = new DampedHarmonicOscillator(113, 9.3, 0.052)
		osc.step(113, 0.001)
		expect(osc.getAcceleration()).toBeCloseTo(1, 10)
		expect(osc.getVelocity()).toBeCloseTo(0.001, 12)
		expect(osc.getDisplacement()).toBeCloseTo(1e-6, 15)
		expect(osc.getMass()).toBe(113)
	})

	it('pulls back toward rest and resets to zero', () => {
		const osc = new DampedHarmonicOscillator(113, 9.3, 0.052)
		osc.step(113, 0.001)
		osc.step(0, 0.001)
		expect(osc.getAcceleration()).toBeLessThan(0)
		osc.reset()
		expect(osc.getAcceleration()).toBe(0)
		expect(osc.getVelocity()).toBe(0)
		expect(osc.getDisplacement()).toBe(0)
	})
})

describe('CabinetPhysics', () => {
	it('exposes cabinet mass and maps displacement to offset', () => {
		const cabinet = new CabinetPhysics()
		expect(cabinet.getMass()).toBe(113)
		expect(cabinet.getOffset().x).toBe(0)
		cabinet.step(new Vertex2D(113, 0))
		expect(cabinet.getAcceleration().x).toBeCloseTo(1, 10)
		expect(cabinet.getOffset().x).toBeCloseTo(1e-6, 12)
		expect(cabinet.getOffset().y).toBe(0)
	})

	it('reports raw displacement as offset on both axes (no magic factors)', () => {
		const cabinet = new CabinetPhysics()
		cabinet.step(new Vertex2D(113, 113))
		// First 1ms step from rest: displacement is exactly v*dt = (F/m*dt)*dt per axis.
		expect(cabinet.getOffset().x).toBeCloseTo(1e-6, 12)
		expect(cabinet.getOffset().y).toBeCloseTo(1e-6, 12)
	})

	it.each([
		// [axis, undamped period ms (1000/f), per-cycle decay exp(-2*pi*zeta/sqrt(1-zeta^2))]
		['x', 1000 / 4.5, 0.7776],
		['y', 1000 / 4.3, 0.7073],
	] as const)('rings at the recalibrated tuning on the %s axis', (axis, periodMs, decay) => {
		const cabinet = new CabinetPhysics()
		// Velocity kick, then free ring-down sampled every millisecond.
		cabinet.step(axis === 'x' ? new Vertex2D(1130, 0) : new Vertex2D(0, 1130))
		const zero = new Vertex2D(0, 0)
		const samples: number[] = []
		for (let i = 0; i < 3000; i++) {
			cabinet.step(zero)
			samples.push(axis === 'x' ? cabinet.getOffset().x : cabinet.getOffset().y)
		}
		const peaks: Array<{ at: number; amp: number }> = []
		for (let i = 1; i < samples.length - 1 && peaks.length < 3; i++) {
			const prev = samples[i - 1] ?? 0
			const curr = samples[i] ?? 0
			const next = samples[i + 1] ?? 0
			if (curr > 0 && curr > prev && curr >= next) {
				peaks.push({ at: i, amp: curr })
			}
		}
		expect(peaks.length).toBe(3)
		const [first, second, third] = peaks as [
			{ at: number; amp: number },
			{ at: number; amp: number },
			{ at: number; amp: number },
		]
		// Damped period is within 0.2% of the undamped period at these damping ratios.
		// Pre-recalibration tuning (9.3Hz/5.8Hz) rings at ~108ms/~172ms: far outside this band.
		expect(Math.abs((third.at - first.at) / 2 - periodMs)).toBeLessThan(8)
		// Pre-recalibration x damping (0.052) decays at ~0.72 per cycle: outside this band.
		expect(Math.abs(second.amp / first.amp - decay)).toBeLessThan(0.03)
	})
})

describe('NudgeHandler', () => {
	it('counts impulses and surfaces cabinet acceleration and offset', () => {
		const handler = new NudgeHandler()
		expect(handler.getIndex()).toBe(0)
		handler.applyImpulse(0, 2)
		expect(handler.getIndex()).toBe(1)
		handler.stepOneMillisecond()
		expect(handler.getCabinetAcceleration().y).toBeLessThan(0)
		expect(handler.getCabinetOffset().y).toBeLessThan(0)
	})
})
