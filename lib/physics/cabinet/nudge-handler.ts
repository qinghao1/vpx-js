// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import type { Vertex2D } from '../../util/vector.js'
import { CabNudge } from './keyboard-nudge.js'

export class NudgeHandler {
	private readonly nudge = new CabNudge()

	applyImpulse(angle: number, force: number): void { this.nudge.nudge(angle, force) }
	stepOneMillisecond(): void { this.nudge.stepOneMillisecond() }
	getCabinetAcceleration(): Vertex2D { return this.nudge.getAcceleration() }
	getCabinetOffset(): Vertex2D { return this.nudge.getOffset() }
}
