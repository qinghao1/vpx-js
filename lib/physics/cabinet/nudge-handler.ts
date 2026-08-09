// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { Vertex2D } from '../../util/vector.js'
import { createKeyboardNudge, type KeyboardNudge, type KeyboardNudgeMode } from './keyboard-nudge.js'

/** Mirrors VPX NudgeHandler — consolidates keyboard nudge sources. @see https://github.com/vpinball/vpinball/blob/master/src/physics/cabinet/NudgeHandler.h */
export class NudgeHandler {
	private keyboardNudge: KeyboardNudge
	private index = 0
	private mode: KeyboardNudgeMode

	constructor(mode: KeyboardNudgeMode = 'cab', strength = 1) {
		this.mode = mode
		this.keyboardNudge = createKeyboardNudge(mode, strength)
	}

	applyImpulse(angle: number, force: number): void {
		this.index++
		this.keyboardNudge.nudge(angle, force)
	}

	stepOneMillisecond(): void {
		this.keyboardNudge.stepOneMillisecond()
	}

	getCabinetAcceleration(): Vertex2D { return this.keyboardNudge.getAcceleration() }
	getCabinetOffset(): Vertex2D { return this.keyboardNudge.getOffset() }
	isActive(): boolean { return this.keyboardNudge.isActive() }
	getIndex(): number { return this.index }

	getMode(): KeyboardNudgeMode { return this.mode }
	setMode(mode: KeyboardNudgeMode): void {
		if (mode === this.mode) return
		const s = this.keyboardNudge.getStrength()
		this.mode = mode
		this.keyboardNudge = createKeyboardNudge(mode, s)
	}

	getStrength(): number { return this.keyboardNudge.getStrength() }
	setStrength(v: number): void { this.keyboardNudge.setStrength(v) }
}
