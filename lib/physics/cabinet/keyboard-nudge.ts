// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Vertex2D } from '../../util/vector.js'
import { CabinetPhysics } from './cabinet-physics.js'

function degToRad(d: number): number {
	return (d * Math.PI) / 180
}

export class CabNudge {
	private readonly cabinet = new CabinetPhysics()
	private impulses: Array<{ elapsed: number; length: number; impulse: Vertex2D }> = []
	private deactivationDelay = 0
	private strength = 1
	private readonly scratch = new Vertex2D()
	private readonly stepForce = new Vertex2D()

	getAcceleration(): Vertex2D {
		return this.cabinet.getAcceleration()
	}
	getOffset(): Vertex2D {
		return this.cabinet.getOffset()
	}
	isActive(): boolean {
		return this.deactivationDelay > 0
	}

	nudge(angle: number, force: number): void {
		const g = 9.80665
		const baseScale = (0.5 * g) / 2
		const actual = force * this.strength * baseScale
		const a = degToRad(angle)
		this.impulses.push({
			elapsed: 0,
			length: 25,
			impulse: new Vertex2D(Math.sin(a) * actual, -Math.cos(a) * actual),
		})
		this.deactivationDelay = 10000
	}

	stepOneMillisecond(): void {
		if (this.deactivationDelay) this.deactivationDelay--
		this.scratch.x = 0
		this.scratch.y = 0
		let write = 0
		for (let read = 0; read < this.impulses.length; read++) {
			const it = this.impulses[read]!
			it.elapsed++
			if (it.elapsed <= it.length) {
				const t = it.elapsed / it.length
				const s = 0.5 * (1 - Math.cos(2 * Math.PI * t))
				this.scratch.x += it.impulse.x * s
				this.scratch.y += it.impulse.y * s
				this.impulses[write++] = it
			}
		}
		if (write < this.impulses.length) this.impulses.length = write
		this.stepForce.x = this.cabinet.getMass() * this.scratch.x
		this.stepForce.y = this.cabinet.getMass() * this.scratch.y
		this.cabinet.step(this.stepForce)
	}
}
