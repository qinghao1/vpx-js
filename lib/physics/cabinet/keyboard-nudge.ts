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
		const actual = force * baseScale
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
		this.cabinet.step(new Vertex2D(this.cabinet.getMass() * impulse.x, this.cabinet.getMass() * impulse.y))
	}
}
